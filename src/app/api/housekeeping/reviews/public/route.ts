import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, sameOriginOrSecret, cap } from "@/lib/housekeeping/rate-limit";
import { resolveQr } from "@/lib/housekeeping/qr-resolve";
import { findVerifiedOtp, normaliseDestination, type OtpChannel } from "@/lib/housekeeping/otp";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// PUBLIC. Two ways to be authorised, and they differ in what they can prove:
//
//   • a consumed OTP — proves the reviewer controls that contact detail, and
//     NOTHING about who they work for. The company stays self-declared and the
//     row says so via `companyVerified: false`. The code is bound to its id and
//     destination and is single-use, so a captured otpId cannot spray reviews.
//
//   • a signed-in CLIENT session — the account already proved the identity at
//     login, so no second code is asked for. Here the employer comes off the User
//     row rather than a dropdown, which is the only case where `companyVerified`
//     may honestly be true.
//
// Staff sessions are NOT accepted as a substitute: an employee leaving feedback
// is not a client, and their review would misrepresent whose opinion it is.
export async function POST(req: NextRequest) {
  if (!sameOriginOrSecret(req, "HK_PUBLIC_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const ipLimit = rateLimit(`review:ip:${ip}`, 10, 10 * 60 * 1000);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Too many reviews submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));

    const code = cap(b.code, 64);
    const otpId = cap(b.otpId, 64);
    const channel: OtpChannel = b.channel === "EMAIL" ? "EMAIL" : "SMS";
    const rawDestination = cap(b.destination, 160);

    if (!code) {
      return NextResponse.json({ error: "Scan the QR code at the area first." }, { status: 400 });
    }

    // A signed-in CLIENT has already proved their identity — at login, by password
    // or by an emailed code. Making them verify a second time to say a bathroom is
    // dirty would be friction with no security value, so the session stands in for
    // the OTP here. Everyone else must still present a verified code.
    const session = await getSessionUser();
    const sessionClient = session?.role === "CLIENT" ? session : null;

    if (!sessionClient && (!otpId || !rawDestination)) {
      return NextResponse.json({ error: "Verify your email before posting." }, { status: 401 });
    }

    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Give a rating from 1 to 5." }, { status: 400 });
    }

    // Session path: the contact detail is the account's own email, taken from the
    // session rather than the body so it cannot be spoofed.
    let destination = sessionClient ? sessionClient.email : "";
    let otp: { id: string } | null = null;

    if (!sessionClient) {
      destination = normaliseDestination(rawDestination, channel);
      otp = await findVerifiedOtp(otpId, destination);
      if (!otp) {
        return NextResponse.json(
          { error: "Your verification has expired. Please verify again." },
          { status: 401 },
        );
      }

      // One review per verified code — otherwise a single verification becomes an
      // unlimited posting licence. A signed-in client is instead bounded by the
      // per-IP rate limit above, since their session is long-lived by design.
      const alreadyUsed = await prisma.clientReview.findFirst({
        where: { otpId: otp.id },
        select: { id: true },
      });
      if (alreadyUsed) {
        return NextResponse.json(
          { error: "You have already posted a review with this verification." },
          { status: 409 },
        );
      }
    }

    // Area comes only from the scanned code.
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

    let clientId: string | null = null;
    let companyNameSnapshot: string | null = null;
    // Genuinely verified only when it comes from the account itself: a signed-in
    // client's employer is on their User row, not something they typed. This is
    // the one path where companyVerified can honestly be true.
    let companyVerified = false;

    const employer = sessionClient
      ? await prisma.user.findUnique({
          where: { id: sessionClient.id },
          select: { employerClient: { select: { id: true, companyName: true, centerId: true } } },
        })
      : null;

    if (employer?.employerClient) {
      clientId = employer.employerClient.id;
      companyNameSnapshot = employer.employerClient.companyName;
      companyVerified = true;
    }

    // Self-declared company. Still validated as belonging to this centre, so the
    // dropdown cannot be used to attach a review to an unrelated tenant.
    const rawClientId = clientId ? null : cap(b.clientId, 64);
    if (rawClientId) {
      const client = await prisma.client.findFirst({
        where: { id: rawClientId, centerId: loc.center.id },
        select: { id: true, companyName: true },
      });
      if (!client) {
        return NextResponse.json({ error: "Select your company from the list." }, { status: 400 });
      }
      clientId = client.id;
      companyNameSnapshot = client.companyName;
    } else if (!companyNameSnapshot) {
      // A guest may name their company freely; it is stored as text only and
      // never linked to a tenant record.
      companyNameSnapshot = cap(b.companyName, 160);
    }

    const review = await prisma.clientReview.create({
      data: {
        centerId: loc.center.id,
        locationId: loc.id,
        clientId,
        companyNameSnapshot,
        // True only for a signed-in client, where the employer came from their
        // account. For everyone else the code proved the contact detail and
        // nothing about who they work for.
        companyVerified,
        rating,
        comment: cap(b.comment, 2000),
        contact: destination,
        channel,
        reviewerName: cap(b.reviewerName, 120),
        otpId: otp?.id ?? null,
        sourceIp: ip,
      },
      select: { id: true, rating: true, createdAt: true },
    });

    await logAction({
      userId: sessionClient?.id ?? null,
      action: "HK_CLIENT_REVIEW_CREATED",
      targetType: "ClientReview",
      targetId: review.id,
      meta: {
        centre: loc.center.name,
        area: loc.name,
        rating,
        company: companyNameSnapshot,
        companyVerified,
        via: sessionClient ? "session" : "otp",
        channel,
        ip,
      },
    });

    return NextResponse.json(
      { ok: true, id: review.id, rating: review.rating, area: loc.name },
      { status: 201 },
    );
  } catch (e: any) {
    console.error("public review failed:", e);
    return NextResponse.json({ error: "Could not post your review." }, { status: 500 });
  }
}
