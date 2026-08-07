import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, cap } from "@/lib/housekeeping/rate-limit";
import {
  issueOtp, normaliseDestination, isValidDestination,
  OTP_PER_DESTINATION, OTP_PER_IP, OTP_WINDOW_MS, OTP_TTL_MINUTES,
} from "@/lib/housekeeping/otp";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

// PUBLIC. Emails a sign-in code.
//
// Passwordless sign-in is offered to CLIENT accounts only. Employees keep their
// password: their accounts reach payroll, invoices and admin, and an inbox is a
// weaker credential than a password for that. A staff email here gets the same
// bland response as an unknown one and simply never receives a code.
//
// The response NEVER reveals whether an account exists. An endpoint that says
// "no such user" is an account-enumeration oracle, and this one is public.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`loginotp:ip:${ip}`, OTP_PER_IP, OTP_WINDOW_MS);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Too many codes requested. Please try again shortly." },
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

    const destLimit = rateLimit(`loginotp:dest:${email}`, OTP_PER_DESTINATION, OTP_WINDOW_MS);
    if (destLimit.limited) {
      return NextResponse.json(
        { error: "A code was already sent. Please wait before requesting another." },
        { status: 429, headers: { "Retry-After": String(destLimit.retryAfterSec) } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, active: true, name: true },
    });

    // Deliberately silent for staff, inactive and unknown addresses alike. The
    // caller cannot tell these apart, and no code is issued in any of them.
    const eligible = Boolean(user && user.active && user.role === "CLIENT");

    if (eligible && user) {
      const otp = await issueOtp({
        destination: email,
        channel: "EMAIL",
        purpose: "LOGIN",
        requestIp: ip,
      });

      await sendMail(
        email,
        `Your sign-in code: ${otp.code}`,
        `Hello${user.name ? ` ${user.name}` : ""},\n\n` +
          `Your sign-in code is ${otp.code}.\n` +
          `It expires in ${OTP_TTL_MINUTES} minutes and can be used once.\n\n` +
          `If you did not try to sign in, you can ignore this email — ` +
          `nobody can access your account with this message alone.`,
      );

      await logAction({
        userId: user.id,
        action: "AUTH_OTP_REQUESTED",
        targetType: "User",
        targetId: user.id,
        // The code is never logged — an audit trail must not carry live credentials.
        meta: { channel: "EMAIL", ip },
      });
    } else {
      await logAction({
        userId: null,
        action: "AUTH_OTP_REQUEST_IGNORED",
        targetType: "User",
        targetId: email,
        meta: { reason: !user ? "unknown" : !user.active ? "inactive" : "not-a-client", ip },
      });
    }

    // One response for every case.
    return NextResponse.json({
      ok: true,
      message: "If that address can sign in with a code, we have sent one.",
      expiresInMinutes: OTP_TTL_MINUTES,
    });
  } catch (e) {
    console.error("login OTP request failed:", e);
    return NextResponse.json({ error: "Could not send a code." }, { status: 500 });
  }
}
