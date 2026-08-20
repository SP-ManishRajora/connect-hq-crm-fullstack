import { CONFIG } from "@/lib/config";
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearSession,
  getDeviceId,
} from "./auth";

// Authenticated fetch with transparent token refresh.
//
// The access token lives one hour, so it WILL expire mid-shift. When the server
// answers 401 the client refreshes once and replays the original request, so no
// screen has to think about token lifetime.
//
// Two rules make that safe:
//   * only ONE refresh runs at a time — a screen firing four parallel requests
//     on a stale token would otherwise spend all four refresh tokens, and since
//     rotation is single-use, three would be rejected and the user signed out
//   * a request is replayed at most once; a second 401 means the session is
//     genuinely gone and the app returns to the login screen

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Raised when the session cannot be recovered — screens send the user to login. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "Your session has expired. Please sign in again.");
  }
}

type Listener = () => void;
const sessionListeners = new Set<Listener>();
export function onSessionExpired(fn: Listener) {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}
function announceExpiry() {
  sessionListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a listener must not break the request path */
    }
  });
}

// The single in-flight refresh, shared by every concurrent caller.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;

      const res = await fetch(`${CONFIG.apiBaseUrl}/api/auth/mobile/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken, deviceId: await getDeviceId() }),
      });
      if (!res.ok) return false;

      const json = (await res.json()) as { accessToken: string; refreshToken: string };
      await saveTokens(json.accessToken, json.refreshToken);
      return true;
    } catch {
      // A network failure is NOT an expired session — the caller retries later.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** multipart bodies are passed through untouched */
  formData?: FormData;
  timeoutMs?: number;
  signal?: AbortSignal;
};

async function rawRequest(path: string, opts: RequestOptions, token: string | null) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData as unknown as BodyInit;
    // Content-Type is deliberately NOT set: fetch must add the multipart
    // boundary itself, and setting it by hand produces an unparseable body.
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  return fetch(`${CONFIG.apiBaseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, opts, await getAccessToken());

  if (res.status === 401) {
    const ok = await refreshTokens();
    if (!ok) {
      await clearSession();
      announceExpiry();
      throw new SessionExpiredError();
    }
    // Replayed once, with the new token.
    res = await rawRequest(path, opts, await getAccessToken());
    if (res.status === 401) {
      await clearSession();
      announceExpiry();
      throw new SessionExpiredError();
    }
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // A non-JSON body from an API path means something in front of the app —
      // a proxy or a captive portal — answered instead of the server.
      parsed = { error: text.slice(0, 200) };
    }
  }

  if (!res.ok) {
    const msg =
      (parsed as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, parsed);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  upload: <T>(path: string, formData: FormData, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", formData, timeoutMs: 60000 }),
};
