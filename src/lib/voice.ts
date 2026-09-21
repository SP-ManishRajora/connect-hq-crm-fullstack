// Voice / VoIP calling — server-only, provider-agnostic.
//
// Mirrors the shape and reasoning of `sms.ts`: one narrow interface, a console
// fallback so local development works end to end, and a single switch where a
// real vendor is implemented. Nothing outside this file knows the provider.
//
// Currently implemented: FreJun (https://frejun.com/docs/).
//
// FreJun's network-calling flow is two-legged and, importantly, rings the AGENT
// first: FreJun calls the user, the user answers, then FreJun dials the lead. If
// the rep does not pick up, the prospect is never disturbed. That matches the
// design in docs/voip/level-1-click-to-call.md §2.1.
//
// TO ENABLE: set VOICE_PROVIDER=frejun plus FREJUN_API_KEY (and optionally
// FREJUN_VIRTUAL_NUMBER). Unset → calls are logged to the console and nothing
// is dialled, so the UI and timeline can be built without a telecom account.

import crypto from "crypto";

const FREJUN_BASE = process.env.FREJUN_BASE_URL || "https://api.frejun.com/api/v1";

export type CallResult =
  | { placed: true; provider: string; callSid: string }
  | { placed: false; provider: string; reason: string };

function provider(): string {
  return (process.env.VOICE_PROVIDER || "").trim().toLowerCase();
}

/** True when a REAL gateway is wired up — i.e. a click actually dials a phone.
 *  "console" is not real: it logs and dials nothing. */
export function voiceConfigured(): boolean {
  const p = provider();
  return p !== "" && p !== "console";
}

/**
 * True when the Call button should be shown.
 *
 * Deliberately broader than `voiceConfigured()`: VOICE_PROVIDER="console" is the
 * dry-run mode, where the button must be visible so the UI and the call history
 * can be exercised without a telecom account. The click then records a CONSOLE
 * CallLog and dials nothing, and the endpoint says so plainly.
 */
export function voiceUiEnabled(): boolean {
  return provider() !== "";
}

export function voiceProviderName(): string {
  return provider() || "console";
}

/**
 * Normalise an Indian phone number to E.164 (+91XXXXXXXXXX).
 *
 * Phone columns in this database are free text and hold a mix of formats
 * ("+91 98765 43210", "09876543210", "9876543210"). FreJun wants E.164, and any
 * future caller-ID matching needs a single canonical form, so every write and
 * comparison goes through here.
 *
 * Returns null when the input cannot be read as a valid number — callers must
 * treat that as "cannot call", not as an empty string.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Keep a leading +, drop spaces, hyphens, brackets and any other punctuation.
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Already international, e.g. +919876543210 or +14155551234.
  if (hasPlus) return digits.length >= 8 ? `+${digits}` : null;

  // 91XXXXXXXXXX — country code without the plus.
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  // 0XXXXXXXXXX — Indian trunk prefix.
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  // XXXXXXXXXX — bare Indian mobile. Valid mobiles start 6-9.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;

  return null;
}

/**
 * Bridge a FreJun agent to a lead. The agent's leg rings first.
 *
 * `agentEmail` must be the rep's email **as registered in FreJun**. FreJun
 * identifies the caller by email, not by phone number, and dials whatever device
 * that user has configured.
 *
 * `callLogId` is passed through as FreJun's `transaction_id` so the webhook can
 * find our row even before we have stored their call_id.
 */
export async function clickToCall(args: {
  agentEmail: string;
  leadPhone: string;
  leadName?: string | null;
  callLogId: string;
}): Promise<CallResult> {
  const p = provider();

  const to = normalisePhone(args.leadPhone);
  if (!to) {
    return { placed: false, provider: p || "console", reason: "Invalid destination number" };
  }

  if (!p || p === "console") {
    console.log(
      `\n📞 [CALL — not placed, no voice gateway configured]` +
        `\n   Agent: ${args.agentEmail}\n   Lead:  ${to}\n   Ref:   ${args.callLogId}\n`,
    );
    return { placed: false, provider: "console", reason: "Voice provider not configured" };
  }

  switch (p) {
    case "frejun":
      return frejunCall({ ...args, leadPhone: to });

    default:
      console.error(
        `VOICE_PROVIDER "${p}" is set but has no implementation in src/lib/voice.ts — ` +
          `call to ${to} was not placed.`,
      );
      return { placed: false, provider: p, reason: `Provider "${p}" not implemented` };
  }
}

// ---------------------------------------------------------------------------
// FreJun
// ---------------------------------------------------------------------------

// FreJun offers OAuth (authorization-code) and a static API key. OAuth needs an
// interactive browser redirect and a 2-hour token refresh cycle, which suits a
// user-facing integration, not a server placing calls on behalf of the org — so
// we use the API key. See https://frejun.com/docs/ "Setup and Authorization".
function frejunAuthHeader(): string | null {
  const key = (process.env.FREJUN_API_KEY || "").trim();
  return key ? `Api-Key ${key}` : null;
}

async function frejunCall(args: {
  agentEmail: string;
  leadPhone: string;
  leadName?: string | null;
  callLogId: string;
}): Promise<CallResult> {
  const auth = frejunAuthHeader();
  if (!auth) {
    return { placed: false, provider: "frejun", reason: "FREJUN_API_KEY is not set" };
  }

  const body: Record<string, string> = {
    user_email: args.agentEmail,
    candidate_number: args.leadPhone,
    // Round-tripped in every webhook payload under metadata.transaction_id.
    transaction_id: args.callLogId,
  };
  if (args.leadName) body.candidate_name = args.leadName.slice(0, 100);
  const vn = normalisePhone(process.env.FREJUN_VIRTUAL_NUMBER);
  if (vn) body.virtual_number = vn;

  let res: Response;
  try {
    res = await fetch(`${FREJUN_BASE}/integrations/create-call/`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // A telephony API that has not answered in 15s is not going to.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "network error";
    console.error("FreJun create-call request failed:", reason);
    return { placed: false, provider: "frejun", reason: `Could not reach FreJun: ${reason}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Fall through — a non-JSON body is reported verbatim below.
  }

  if (!res.ok || json?.success === false) {
    const reason =
      json?.message || json?.detail || text.slice(0, 300) || `HTTP ${res.status}`;
    console.error("FreJun create-call rejected:", res.status, reason);
    return { placed: false, provider: "frejun", reason };
  }

  // Documented success shape:
  //   { success, message, data: { status, info, event_id, call_id, candidate_name } }
  // The VoIP endpoint returns `data` as a bare string id, so accept both rather
  // than assuming one and silently losing the id.
  const callSid =
    typeof json?.data === "string"
      ? json.data
      : json?.data?.call_id != null
        ? String(json.data.call_id)
        : null;

  if (!callSid) {
    // The call may well have been placed — we just cannot correlate it. Say so
    // honestly rather than reporting a success we cannot track.
    console.error("FreJun create-call succeeded but returned no call_id:", text.slice(0, 300));
    return { placed: false, provider: "frejun", reason: "FreJun returned no call_id" };
  }

  return { placed: true, provider: "frejun", callSid };
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verify a FreJun webhook signature.
 *
 * FreJun sends two headers, both HMAC-SHA256 keyed with the app's Client Secret
 * and base64-encoded:
 *   frejun-signature       = HMAC(method + requestUri + rawBody)
 *   frejun-signature-slim  = HMAC(method + requestUri + call_id)
 *
 * We check the full signature when present and fall back to the slim one. The
 * URI must be the callback URL exactly as registered with FreJun — behind a
 * proxy, `req.url` may be the internal address, so FREJUN_WEBHOOK_URL is used
 * when set.
 *
 * Returns false when no secret is configured: an unverifiable webhook is not a
 * trusted one, and the caller rejects the request.
 */
export function verifyFrejunWebhook(args: {
  method: string;
  requestUrl: string;
  rawBody: string;
  callId?: string | null;
  signature?: string | null;
  signatureSlim?: string | null;
}): boolean {
  const secret = (process.env.FREJUN_CLIENT_SECRET || "").trim();
  if (!secret) return false;

  const uri = (process.env.FREJUN_WEBHOOK_URL || args.requestUrl).trim();

  const expect = (payload: string) =>
    crypto.createHmac("sha256", secret).update(Buffer.from(payload, "utf8")).digest("base64");

  if (args.signature) {
    if (safeEqual(expect(args.method + uri + args.rawBody), args.signature)) return true;
  }
  if (args.signatureSlim && args.callId) {
    if (safeEqual(expect(args.method + uri + args.callId), args.signatureSlim)) return true;
  }
  return false;
}

/** Constant-time compare that cannot throw on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Map FreJun's human-readable call_status onto our CallLog.status enum.
 *
 * Documented values: "Outbound call initiated", "Inbound call initiated",
 * "Call answered", "Call completed", "Call busy". Matching is done on
 * lowercased substrings because the exact casing is not contractual.
 */
export function mapFrejunStatus(raw: string | null | undefined): string {
  const s = (raw || "").toLowerCase();
  if (!s) return "UNKNOWN";
  if (s.includes("completed")) return "COMPLETED";
  if (s.includes("answered")) return "ANSWERED";
  if (s.includes("busy")) return "BUSY";
  if (s.includes("initiated")) return "RINGING";
  if (s.includes("no answer") || s.includes("noanswer") || s.includes("missed")) return "NO_ANSWER";
  if (s.includes("fail")) return "FAILED";
  if (s.includes("cancel") || s.includes("abandon")) return "ABANDONED";
  return "UNKNOWN";
}

/** Statuses after which no further status webhook is expected. */
export function isTerminalStatus(status: string): boolean {
  return ["COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "BLOCKED_DND", "ABANDONED"].includes(status);
}
