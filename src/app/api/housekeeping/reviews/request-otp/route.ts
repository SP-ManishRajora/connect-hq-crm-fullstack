import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, sameOriginOrSecret, cap } from "@/lib/housekeeping/rate-limit";
import { resolveQr } from "@/lib/housekeeping/qr-resolve";
import {
  issueOtp, normaliseDestination, isValidDestination,
  OTP_PER_DESTINATION, OTP_PER_IP, OTP_WINDOW_MS, OTP_TTL_MINUTES,
  type OtpChannel,
} from "@/lib/housekeeping/otp";
import { sendOtpMessage, smsConfigured } from "@/lib/sms";

export const runtime = "nodejs";

// PUBLIC, UNAUTHENTICATED — reached by scanning the area sticker.
//
// This endpoint sends messages, so abuse here costs real money and can be used to
// harass a phone number. Hence: per-destination and per-IP rate limits, a valid
// area code required before anything is sent, and no reflection of whether a
// number is already known to us.
export async function POST(req: NextRequest) {
  if (!sameOriginOrSecret(req, "HK_PUBLIC_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const ipLimit = rateLimit(`otp:ip:${ip}`, OTP_PER_IP, OTP_WINDOW_MS);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Too many codes requested. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));

    const code = cap(b.code, 64);
    if (!code) {
      return NextResponse.json({ error: "Scan the QR code at the area first." }, { status: 400 });
    }

    const channel: OtpChannel = b.channel === "EMAIL" ? "EMAIL" : "SMS";
    const rawDestination = cap(b.destination, 160);
    if (!rawDestination) {
      return NextResponse.json(
        { error: channel === "EMAIL" ? "Enter your email address." : "Enter your mobile number." },
        { status: 400 },
      );
    }

    const destination = normaliseDestination(rawDestination, channel);
    if (!isValidDestination(destination, channel)) {
      return NextResponse.json(
        {
          error:
            channel === "EMAIL"
              ? "Enter a valid email address."
              : "Enter a valid 10-digit Indian mobile number.",
        },
        { status: 400 },
      );
    }

    // Per-destination limit stops one number being flooded from many IPs.
    const destLimit = rateLimit(`otp:dest:${destination}`, OTP_PER_DESTINATION, OTP_WINDOW_MS);
    if (destLimit.limited) {
      return NextResponse.json(
        { error: "A code was already sent. Please wait before requesting another." },
        { status: 429, headers: { "Retry-After": String(destLimit.retryAfterSec) } },
      );
    }

    // The area comes only from the scanned code — never from the body.
    const qr = await resolveQr(code);
    if (!qr || !qr.active) {
      return NextResponse.json({ error: "This code is not recognised." }, { status: 404 });
    }
    const loc = await prisma.inspectionLocation.findUnique({
      where: { id: qr.locationId },
      include: { center: { select: { id: true, name: true } } },
    });
    if (!loc || loc.deletedAt) {
      return NextResponse.json({ error: "This code is not recognised." }, { status: 404 });
    }

    const otp = await issueOtp({
      destination,
      channel,
      locationId: loc.id,
      centerId: loc.center.id,
      requestIp: ip,
    });

    const delivery = await sendOtpMessage(destination, channel, otp.code, {
      area: loc.name,
      centre: loc.center.name,
    });

    await logAction({
      userId: null,
      action: "HK_REVIEW_OTP_SENT",
      targetType: "InspectionLocation",
      targetId: loc.id,
      // The code itself is never logged — an audit trail is not a place to leak
      // live credentials.
      meta: { channel, delivered: delivery.sent, area: loc.name, ip },
    });

    // In development, with no gateway wired up, the code cannot reach anyone —
    // so return it to keep the flow testable. Gated on NODE_ENV *and* on there
    // being no real provider, so a configured deployment can never expose it.
    const devCode =
      process.env.NODE_ENV !== "production" && !smsConfigured() && channel === "SMS"
        ? otp.code
        : undefined;

    return NextResponse.json({
      ok: true,
      otpId: otp.id,
      destination,
      channel,
      expiresInMinutes: OTP_TTL_MINUTES,
      // Told plainly so the UI can advise switching channel rather than leaving
      // someone waiting for a message that was never sent.
      delivered: delivery.sent,
      deliveryNote: delivery.sent ? undefined : delivery.reason,
      devCode,
    });
  } catch (e: any) {
    console.error("OTP request failed:", e);
    return NextResponse.json({ error: "Could not send a code." }, { status: 500 });
  }
}
