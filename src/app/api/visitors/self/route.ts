import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, sameOriginOrSecret, cap } from "@/lib/housekeeping/rate-limit";
import {
  issueOtp, verifyOtp, normaliseDestination, isValidDestination,
  OTP_PER_DESTINATION, OTP_PER_IP, OTP_WINDOW_MS, OTP_TTL_MINUTES,
} from "@/lib/housekeeping/otp";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

// PUBLIC. Visitor self check-in at reception.
//
// This issues NO session and creates no account. A visitor confirms an email they
// control and their arrival is stamped on a Visitor row — a verified fact added to
// a staff-owned record, not a login. That is the whole reason it can be public:
// there is no credential here to steal.
//
// Two actions on one route, because they are two halves of one exchange:
//   { action: "REQUEST", email }        → mails a code
//   { action: "VERIFY", email, code, name, phone, centerId } → records the visit
export async function POST(req: NextRequest) {
  if (!sameOriginOrSecret(req, "HK_PUBLIC_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const ipLimit = rateLimit(`visit:ip:${ip}`, OTP_PER_IP, OTP_WINDOW_MS);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));
    const raw = cap(b.email, 160);
    if (!raw) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

    const email = normaliseDestination(raw, "EMAIL");
    if (!isValidDestination(email, "EMAIL")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // ---------- request a code ----------
    if (b.action !== "VERIFY") {
      const destLimit = rateLimit(`visit:dest:${email}`, OTP_PER_DESTINATION, OTP_WINDOW_MS);
      if (destLimit.limited) {
        return NextResponse.json(
          { error: "A code was already sent. Please wait before requesting another." },
          { status: 429, headers: { "Retry-After": String(destLimit.retryAfterSec) } },
        );
      }

      const otp = await issueOtp({
        destination: email,
        channel: "EMAIL",
        purpose: "VISIT",
        centerId: cap(b.centerId, 64),
        requestIp: ip,
      });

      await sendMail(
        email,
        `Your check-in code: ${otp.code}`,
        `Your check-in code is ${otp.code}.\n` +
          `It expires in ${OTP_TTL_MINUTES} minutes.\n\n` +
          `If you are not checking in at one of our centres, please ignore this email.`,
      );

      return NextResponse.json({ ok: true, expiresInMinutes: OTP_TTL_MINUTES });
    }

    // ---------- verify and record the visit ----------
    const code = cap(b.code, 12);
    if (!code) return NextResponse.json({ error: "Enter the code we emailed you." }, { status: 400 });

    const result = await verifyOtp(email, code, "VISIT");
    if (result.ok === false) {
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

    const name = cap(b.name, 120);
    if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });

    // The centre must be a real, active one — a visitor cannot invent a location.
    let centerId: string | null = null;
    const rawCenterId = cap(b.centerId, 64);
    if (rawCenterId) {
      const centre = await prisma.center.findFirst({
        where: { id: rawCenterId, active: true },
        select: { id: true },
      });
      if (!centre) return NextResponse.json({ error: "Choose a centre." }, { status: 400 });
      centerId = centre.id;
    }

    const now = new Date();

    // Reuse today's row for this email and centre rather than creating a duplicate
    // when someone re-checks in — a second tap on the button is a repeat, not a
    // second visit. Earlier visits are left untouched as history.
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await prisma.visitor.findFirst({
      where: { email, centerId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const data = {
      name,
      email,
      phone: cap(b.phone, 20),
      centerId,
      emailVerified: true,
      verifiedAt: now,
      checkedInAt: now,
      otpId: result.otpId,
      notes: cap(b.purpose, 500),
    };

    const visitor = existing
      ? await prisma.visitor.update({ where: { id: existing.id }, data })
      : await prisma.visitor.create({ data });

    await logAction({
      userId: null,
      action: existing ? "VISITOR_SELF_CHECKIN_UPDATED" : "VISITOR_SELF_CHECKIN",
      targetType: "Visitor",
      targetId: visitor.id,
      meta: { email, centerId, ip },
    });

    return NextResponse.json(
      { ok: true, id: visitor.id, name: visitor.name, checkedInAt: visitor.checkedInAt },
      { status: existing ? 200 : 201 },
    );
  } catch (e) {
    console.error("visitor self check-in failed:", e);
    return NextResponse.json({ error: "Could not complete check-in." }, { status: 500 });
  }
}
