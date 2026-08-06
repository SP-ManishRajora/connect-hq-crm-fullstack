// SMS sending — server-only, and deliberately provider-agnostic.
//
// No SMS gateway is wired up yet. Rather than guess at a vendor's payload shape
// and ship something that fails silently in production, this exposes one narrow
// interface and a console fallback that mirrors `sendMail`'s behaviour when SMTP
// is unset: local and dev flows work end-to-end, and nothing pretends a message
// was delivered when it was not.
//
// TO ENABLE A REAL GATEWAY: implement `deliver` in the switch below for your
// provider and set SMS_PROVIDER plus its credentials. The call sites do not
// change — they already handle `{ sent: false }`.

export type SmsResult =
  | { sent: true; provider: string; id?: string }
  | { sent: false; reason: string; provider: string };

function provider(): string {
  return (process.env.SMS_PROVIDER || "").trim().toLowerCase();
}

/** True when a real gateway is configured — callers use this to decide whether
 *  it is safe to show the code on screen in development. */
export function smsConfigured(): boolean {
  return provider() !== "" && provider() !== "console";
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const p = provider();

  if (!p || p === "console") {
    console.log(`\n📱 [SMS — not sent, no gateway configured] To: ${to}\n${body}\n`);
    return { sent: false, reason: "SMS provider not configured", provider: "console" };
  }

  switch (p) {
    // Each case needs the vendor's exact endpoint, auth header and body shape.
    // Left unimplemented on purpose: a plausible-looking guess would fail only in
    // production, where a member is standing at a door waiting for a code.
    case "twilio":
    case "msg91":
    case "gupshup":
    default:
      console.error(
        `SMS provider "${p}" is set but has no implementation in src/lib/sms.ts — message to ${to} was not sent.`,
      );
      return { sent: false, reason: `Provider "${p}" not implemented`, provider: p };
  }
}

/**
 * Deliver a passcode over the requested channel.
 *
 * Returns whether it actually went out. The caller must NOT treat a false result
 * as success — the OTP row is already stored either way, so a failed send simply
 * means the person never receives it and should retry or switch channel.
 */
export async function sendOtpMessage(
  destination: string,
  channel: "SMS" | "EMAIL",
  code: string,
  context: { area?: string | null; centre?: string | null },
): Promise<{ sent: boolean; reason?: string }> {
  const where = [context.area, context.centre].filter(Boolean).join(", ");
  const text =
    `Your verification code is ${code}.\n` +
    (where ? `For feedback about ${where}.\n` : "") +
    `It expires in 10 minutes. Do not share this code with anyone.`;

  if (channel === "EMAIL") {
    const { sendMail } = await import("@/lib/mail");
    const r = await sendMail(destination, `Your verification code: ${code}`, text);
    return { sent: r.sent, reason: "reason" in r ? r.reason : undefined };
  }

  const r = await sendSms(destination, text);
  return { sent: r.sent, reason: "reason" in r ? r.reason : undefined };
}
