import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, sameOriginOrSecret, cap } from "@/lib/housekeeping/rate-limit";
import {
  verifyOtp, normaliseDestination, OTP_WINDOW_MS, OTP_REVIEW_GRACE_MINUTES,
  type OtpChannel,
} from "@/lib/housekeeping/otp";

export const runtime = "nodejs";

// PUBLIC, UNAUTHENTICATED. Checks a passcode and, on success, hands back the
// otpId that authorises one review submission.
//
// Attempts are capped inside verifyOtp() per code; the IP limit here is a second
// layer against someone cycling destinations. Every failure returns the SAME
// message, so responses cannot be used to work out which numbers have codes
// outstanding.
export async function POST(req: NextRequest) {
  if (!sameOriginOrSecret(req, "HK_PUBLIC_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(`otpverify:ip:${ip}`, 20, OTP_WINDOW_MS);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));

    const channel: OtpChannel = b.channel === "EMAIL" ? "EMAIL" : "SMS";
    const rawDestination = cap(b.destination, 160);
    const code = cap(b.code, 12);
    if (!rawDestination || !code) {
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    const destination = normaliseDestination(rawDestination, channel);
    const result = await verifyOtp(destination, code);

    if (result.ok === false) {
      // TOO_MANY_ATTEMPTS is worth distinguishing: it tells the person to request
      // a fresh code rather than keep guessing. The rest collapse into one message
      // so a wrong code and an unknown destination look identical.
      const tooMany = result.reason === "TOO_MANY_ATTEMPTS";
      await logAction({
        userId: null,
        action: "HK_REVIEW_OTP_FAILED",
        targetType: "ClientOtp",
        targetId: destination,
        meta: { reason: result.reason, channel, ip },
      });
      return NextResponse.json(
        {
          error: tooMany
            ? "Too many incorrect attempts. Request a new code."
            : "That code is incorrect or has expired.",
        },
        { status: 400 },
      );
    }

    await logAction({
      userId: null,
      action: "HK_REVIEW_OTP_VERIFIED",
      targetType: "ClientOtp",
      targetId: result.otpId,
      meta: { channel, ip },
    });

    return NextResponse.json({
      ok: true,
      otpId: result.otpId,
      destination,
      channel,
      // The window in which the review must be submitted.
      validForMinutes: OTP_REVIEW_GRACE_MINUTES,
    });
  } catch (e: any) {
    console.error("OTP verify failed:", e);
    return NextResponse.json({ error: "Could not verify that code." }, { status: 500 });
  }
}
