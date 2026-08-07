import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, cap } from "@/lib/housekeeping/rate-limit";
import { verifyOtp, normaliseDestination, OTP_WINDOW_MS } from "@/lib/housekeeping/otp";

export const runtime = "nodejs";

// PUBLIC. Exchanges a valid sign-in code for a session.
//
// This is the one place where a passcode becomes a real session cookie, so the
// eligibility rules from the request endpoint are enforced AGAIN here rather than
// trusted. A code is not a capability by itself: it proves the holder controls an
// inbox, and only a CLIENT account may be entered that way.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = rateLimit(`loginotpverify:ip:${ip}`, 20, OTP_WINDOW_MS);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));
    const raw = cap(b.email, 160);
    const code = cap(b.code, 12);
    if (!raw || !code) {
      return NextResponse.json({ error: "Enter the code we emailed you." }, { status: 400 });
    }

    const email = normaliseDestination(raw, "EMAIL");
    const result = await verifyOtp(email, code, "LOGIN");

    if (result.ok === false) {
      await logAction({
        userId: null,
        action: "AUTH_OTP_FAILED",
        targetType: "User",
        targetId: email,
        meta: { reason: result.reason, ip },
      });
      return NextResponse.json(
        {
          error:
            result.reason === "TOO_MANY_ATTEMPTS"
              ? "Too many incorrect attempts. Request a new code."
              : "That code is incorrect or has expired.",
        },
        { status: 400 },
      );
    }

    // Re-checked after the code passes: the account may have been deactivated or
    // had its role changed in the ten minutes the code was alive.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || user.role !== "CLIENT") {
      await logAction({
        userId: user?.id ?? null,
        action: "AUTH_OTP_REFUSED",
        targetType: "User",
        targetId: user?.id ?? email,
        meta: { reason: !user ? "unknown" : !user.active ? "inactive" : "not-a-client", ip },
      });
      // The code is already consumed, so a refusal here cannot be retried.
      return NextResponse.json({ error: "That code is incorrect or has expired." }, { status: 400 });
    }

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      centerId: user.centerId,
      allowedModules: user.allowedModules ?? null,
    });

    await logAction({
      userId: user.id,
      action: "AUTH_OTP_LOGIN",
      targetType: "User",
      targetId: user.id,
      meta: { channel: "EMAIL", ip },
    });

    return NextResponse.json({ id: user.id, role: user.role, name: user.name });
  } catch (e) {
    console.error("login OTP verify failed:", e);
    return NextResponse.json({ error: "Could not verify that code." }, { status: 500 });
  }
}
