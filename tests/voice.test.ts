import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import {
  normalisePhone,
  mapFrejunStatus,
  isTerminalStatus,
  verifyFrejunWebhook,
  voiceConfigured,
  voiceUiEnabled,
  clickToCall,
} from "@/lib/voice";

// The VoIP integration's two genuinely dangerous failure modes are (a) dialling
// the wrong number because a phone string was parsed loosely, and (b) accepting
// a forged webhook. These tests pin both, plus the status mapping that decides
// whether a lead's timeline says "connected" or "no answer".

describe("normalisePhone", () => {
  it("accepts the formats actually present in the database", () => {
    expect(normalisePhone("9876543210")).toBe("+919876543210");
    expect(normalisePhone("09876543210")).toBe("+919876543210");
    expect(normalisePhone("919876543210")).toBe("+919876543210");
    expect(normalisePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalisePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalisePhone("  +91 (98765) 43210 ")).toBe("+919876543210");
  });

  it("preserves non-Indian international numbers", () => {
    expect(normalisePhone("+1 415 555 1234")).toBe("+14155551234");
  });

  it("rejects anything it cannot read as a number", () => {
    // Returning null matters: the caller must show "no valid number" rather
    // than dialling something truncated.
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("   ")).toBeNull();
    expect(normalisePhone("not a phone")).toBeNull();
    expect(normalisePhone("12345")).toBeNull();
  });

  it("rejects 10-digit numbers that are not valid Indian mobiles", () => {
    // Indian mobiles start 6-9. A landline pasted without an STD code would
    // otherwise be silently turned into a mobile number.
    expect(normalisePhone("1234567890")).toBeNull();
    expect(normalisePhone("5551234567")).toBeNull();
    expect(normalisePhone("6123456789")).toBe("+916123456789");
  });
});

describe("mapFrejunStatus", () => {
  it("maps FreJun's documented status strings", () => {
    expect(mapFrejunStatus("Outbound call initiated")).toBe("RINGING");
    expect(mapFrejunStatus("Inbound call initiated")).toBe("RINGING");
    expect(mapFrejunStatus("Call answered")).toBe("ANSWERED");
    expect(mapFrejunStatus("Call completed")).toBe("COMPLETED");
    expect(mapFrejunStatus("Call busy")).toBe("BUSY");
  });

  it("is case-insensitive", () => {
    expect(mapFrejunStatus("CALL COMPLETED")).toBe("COMPLETED");
    expect(mapFrejunStatus("call busy")).toBe("BUSY");
  });

  it("returns UNKNOWN rather than guessing", () => {
    // An unrecognised status must not be mapped onto COMPLETED — that would
    // report a connected call that may never have happened.
    expect(mapFrejunStatus("")).toBe("UNKNOWN");
    expect(mapFrejunStatus(null)).toBe("UNKNOWN");
    expect(mapFrejunStatus("something new")).toBe("UNKNOWN");
  });
});

describe("isTerminalStatus", () => {
  it("treats only settled outcomes as terminal", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("NO_ANSWER")).toBe(true);
    expect(isTerminalStatus("BUSY")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
  });

  it("does not treat in-flight states as terminal", () => {
    // ANSWERED is mid-call: a status webhook for it must not trigger the
    // timeline entry, or the entry would be written before the call ends.
    expect(isTerminalStatus("ANSWERED")).toBe(false);
    expect(isTerminalStatus("RINGING")).toBe(false);
    expect(isTerminalStatus("INITIATED")).toBe(false);
    expect(isTerminalStatus("UNKNOWN")).toBe(false);
  });
});

describe("verifyFrejunWebhook", () => {
  const SECRET = "test-client-secret";
  const URL = "https://crm.example.com/api/voice/webhook";

  const sign = (payload: string) =>
    crypto.createHmac("sha256", SECRET).update(Buffer.from(payload, "utf8")).digest("base64");

  beforeEach(() => {
    process.env.FREJUN_CLIENT_SECRET = SECRET;
    process.env.FREJUN_WEBHOOK_URL = URL;
  });

  afterEach(() => {
    delete process.env.FREJUN_CLIENT_SECRET;
    delete process.env.FREJUN_WEBHOOK_URL;
  });

  const body = JSON.stringify({ event: "call.status", call_id: "abc123" });

  it("accepts a correct full signature", () => {
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: body,
        callId: "abc123",
        signature: sign("POST" + URL + body),
      }),
    ).toBe(true);
  });

  it("accepts a correct slim signature", () => {
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: body,
        callId: "abc123",
        signatureSlim: sign("POST" + URL + "abc123"),
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = JSON.stringify({ event: "call.status", call_id: "abc123", duration: 99999 });
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: tampered,
        callId: "abc123",
        signature: sign("POST" + URL + body),
      }),
    ).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const forged = crypto
      .createHmac("sha256", "wrong-secret")
      .update(Buffer.from("POST" + URL + body, "utf8"))
      .digest("base64");
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: body,
        callId: "abc123",
        signature: forged,
      }),
    ).toBe(false);
  });

  it("rejects when no signature header is present", () => {
    expect(
      verifyFrejunWebhook({ method: "POST", requestUrl: URL, rawBody: body, callId: "abc123" }),
    ).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    // An unverifiable webhook is not a trusted one. Failing open here would
    // let anyone on the internet write call records into the CRM.
    delete process.env.FREJUN_CLIENT_SECRET;
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: body,
        callId: "abc123",
        signature: sign("POST" + URL + body),
      }),
    ).toBe(false);
  });

  it("does not throw on a malformed signature of a different length", () => {
    expect(
      verifyFrejunWebhook({
        method: "POST",
        requestUrl: URL,
        rawBody: body,
        callId: "abc123",
        signature: "short",
      }),
    ).toBe(false);
  });
});

describe("provider gating", () => {
  const original = process.env.VOICE_PROVIDER;
  afterEach(() => {
    if (original === undefined) delete process.env.VOICE_PROVIDER;
    else process.env.VOICE_PROVIDER = original;
  });

  it("hides the UI only when VOICE_PROVIDER is entirely unset", () => {
    delete process.env.VOICE_PROVIDER;
    expect(voiceUiEnabled()).toBe(false);
    expect(voiceConfigured()).toBe(false);
  });

  it("shows the Call button in console mode but reports no real gateway", () => {
    // Regression: the button was originally gated on voiceConfigured(), which
    // excludes "console" — so the documented dry-run mode rendered no button at
    // all and there was no way to exercise the UI without a telecom account.
    process.env.VOICE_PROVIDER = "console";
    expect(voiceUiEnabled()).toBe(true);
    expect(voiceConfigured()).toBe(false);
  });

  it("treats a real provider as both UI-enabled and configured", () => {
    process.env.VOICE_PROVIDER = "frejun";
    expect(voiceUiEnabled()).toBe(true);
    expect(voiceConfigured()).toBe(true);
  });
});

describe("clickToCall without a configured provider", () => {
  const original = process.env.VOICE_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.VOICE_PROVIDER;
    else process.env.VOICE_PROVIDER = original;
    vi.restoreAllMocks();
  });

  it("reports not-configured and dials nothing", async () => {
    delete process.env.VOICE_PROVIDER;
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(voiceConfigured()).toBe(false);

    const r = await clickToCall({
      agentEmail: "rep@example.com",
      leadPhone: "9876543210",
      callLogId: "log1",
    });

    expect(r.placed).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an invalid destination before contacting any provider", async () => {
    process.env.VOICE_PROVIDER = "frejun";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r = await clickToCall({
      agentEmail: "rep@example.com",
      leadPhone: "not a number",
      callLogId: "log1",
    });

    expect(r.placed).toBe(false);
    if (r.placed === false) expect(r.reason).toMatch(/invalid destination/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("middleware public paths", () => {
  it("exposes the webhook but never the call-placing endpoint", async () => {
    // Regression: /api/voice/webhook was missing from PUBLIC_PATHS, so middleware
    // 401'd every FreJun delivery before the route could verify its signature.
    // Calls connected and nothing ever logged. The webhook is safe to expose
    // because it authenticates by HMAC; /api/voice/call must stay session-gated
    // or anyone could make the system dial arbitrary numbers.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
    );
    const publicBlock = src.slice(src.indexOf("PUBLIC_PATHS"), src.indexOf("function isPublic"));
    expect(publicBlock).toContain('"/api/voice/webhook"');
    expect(publicBlock).not.toContain('"/api/voice/call"');
  });
});

describe("env: secrets containing '$'", () => {
  it("documents that every $ in FREJUN_CLIENT_SECRET must be backslash-escaped", async () => {
    // dotenv (via @next/env) performs $VAR expansion on values in BOTH single and
    // double quotes. FreJun-issued secrets are PBKDF2-shaped ($pbkdf2-sha256$...),
    // so an unescaped value is silently truncated — 87 chars became 43 — and every
    // webhook signature fails with a 401 that looks like a wrong secret.
    // Only a backslash-escaped \$ survives. This test pins the .env convention.
    const fs = await import("node:fs/promises");
    const envPath = new URL("../.env", import.meta.url);

    let raw: string;
    try {
      raw = await fs.readFile(envPath, "utf8");
    } catch {
      return; // no .env in CI — nothing to assert
    }

    const line = raw.split("\n").find((l) => l.trimStart().startsWith("FREJUN_CLIENT_SECRET="));
    if (!line) return; // not configured here

    const value = line.slice(line.indexOf("=") + 1).trim();
    const unquoted = value.replace(/^["']|["']$/g, "");
    // Any bare $ (one not preceded by a backslash) would be eaten by dotenv.
    expect(/(^|[^\\])\$/.test(unquoted)).toBe(false);
  });
});
