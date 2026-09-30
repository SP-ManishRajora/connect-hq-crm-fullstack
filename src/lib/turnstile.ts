// Cloudflare Turnstile verification for public forms.
//
// Returns "ok" when the token checks out, "unreachable" when Cloudflare could
// not be asked (callers let that through — an outage must not cost real
// leads), and otherwise Cloudflare's error codes. With TURNSTILE_SECRET_KEY
// unset it returns "disabled", so the check can ship before the keys exist.

export type TurnstileVerdict = "ok" | "disabled" | "unreachable" | "missing" | string;

export async function verifyTurnstile(token: unknown, ip?: string): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "disabled";
  if (typeof token !== "string" || !token) return "missing";

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return "unreachable";
    const data = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return "ok";
    return data["error-codes"]?.join(",") || "failed";
  } catch {
    return "unreachable";
  }
}

export function turnstilePassed(v: TurnstileVerdict): boolean {
  return v === "ok" || v === "disabled" || v === "unreachable";
}
