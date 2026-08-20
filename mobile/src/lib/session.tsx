import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { CONFIG } from "./config";
import {
  getUser, saveUser, saveTokens, clearSession, getDeviceId,
  getRefreshToken, type MobileUser,
} from "@/api/auth";
import { onSessionExpired } from "@/api/client";
import { initDb } from "@/db/outbox";

type LoginResult = { ok: true } | { ok: false; error: string };

type SessionValue = {
  user: MobileUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<LoginResult>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<SessionValue>({
  user: null,
  ready: false,
  signIn: async () => ({ ok: false, error: "not ready" }),
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initDb();
      setUser(await getUser());
      setReady(true);
    })();

    // The API client raises this when a refresh fails. Clearing state here is
    // what actually returns the app to the login screen — the queued work is
    // deliberately left on disk and drains after the next sign-in.
    const unsubscribe = onSessionExpired(() => setUser(null));
    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch(`${CONFIG.apiBaseUrl}/api/auth/mobile/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          deviceId: await getDeviceId(),
        }),
        signal: AbortSignal.timeout(20000),
      });

      // A server that has not been updated yet has no mobile login route, so its
      // middleware redirects the POST to the HTML login page — which arrives as
      // status 200 with a body fetch cannot parse. That is a DEPLOYMENT problem,
      // not a connection problem, and saying "check your connection" sends the
      // user to look at their phone instead of the server.
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return {
          ok: false,
          error:
            "This server does not support app sign-in yet. The housekeeping app endpoints need to be deployed to " +
            `${CONFIG.apiBaseUrl.replace(/^https?:\/\//, "")}.`,
        };
      }

      const body = (await res.json().catch(() => null)) as
        | { accessToken: string; refreshToken: string; user: MobileUser; error?: string }
        | null;

      if (!res.ok || !body?.accessToken) {
        return { ok: false, error: body?.error || `Sign-in failed (${res.status})` };
      }

      await saveTokens(body.accessToken, body.refreshToken);
      await saveUser(body.user);
      setUser(body.user);
      return { ok: true };
    } catch (e) {
      // Distinguish "we could not reach the server" from "you got it wrong" —
      // on a phone in a basement these are very different problems. Anything
      // that reached the server but answered oddly is handled above, so what is
      // left here really is a transport failure.
      const host = CONFIG.apiBaseUrl.replace(/^https?:\/\//, "");
      const msg =
        e instanceof Error && e.name === "TimeoutError"
          ? `${host} did not respond in time. Check your connection and try again.`
          : `Could not reach ${host}. Check your connection and try again.`;
      return { ok: false, error: msg };
    }
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    // Tell the server so the refresh token is revoked rather than left live for
    // its full 60 days. Best-effort: a signed-out phone with no signal must
    // still clear locally.
    if (refreshToken) {
      try {
        await fetch(`${CONFIG.apiBaseUrl}/api/auth/mobile/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        /* revocation is best-effort; the token still expires on its own */
      }
    }
    await clearSession();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
