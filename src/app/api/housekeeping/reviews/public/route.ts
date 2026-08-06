import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { rateLimit, clientIp, sameOriginOrSecret, cap } from "@/lib/housekeeping/rate-limit";
import { resolveQr } from "@/lib/housekeeping/qr-resolve";
import { findVerifiedOtp, normaliseDestination, type OtpChannel } from "@/lib/housekeeping/otp";

export const runtime = "nodejs";

// PUBLIC, UNAUTHENTICATED — but only reachable with a consumed OTP.
//
// The verified passcode is the whole authorisation: it proves the reviewer
// controls the contact detail attached to the review. It does NOT prove they work
// for the company they picked — company selection stays self-declared, and the
// row records that honestly via `companyVerified: false` rather than implying a
// check we never performed.
//
// The OTP is bound to its id AND destination and is single-use for review
// purposes, so a captured otpId cannot be replayed to spray reviews.
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
    if (!otpId || !rawDestination) {
      return NextResponse.json({ error: "Verify your number before posting." }, { status: 401 });
    }

    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Give a rating from 1 to 5." }, { status: 400 });
    }

    const destination = normaliseDestination(rawDestination, channel);
    const otp = await findVerifiedOtp(otpId, destination);
    if (!otp) {
      return NextResponse.json(
        { error: "Your verification has expired. Please verify again." },
        { status: 401 },
      );
    }

    // One review per verified code — otherwise a single verification becomes an
    // unlimited posting licence.
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

    // Self-declared company. Still validated as belonging to this centre, so the
    // dropdown cannot be used to attach a review to an unrelated tenant.
    let clientId: string | null = null;
    let companyNameSnapshot: string | null = null;
    const rawClientId = cap(b.clientId, 64);
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
    } else {
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
        // The OTP proved the contact detail, not the employment.
        companyVerified: false,
        rating,
        comment: cap(b.comment, 2000),
        contact: destination,
        channel,
        reviewerName: cap(b.reviewerName, 120),
        otpId: otp.id,
        sourceIp: ip,
      },
      select: { id: true, rating: true, createdAt: true },
    });

    await logAction({
      userId: null,
      action: "HK_CLIENT_REVIEW_CREATED",
      targetType: "ClientReview",
      targetId: review.id,
      meta: {
        centre: loc.center.name,
        area: loc.name,
        rating,
        company: companyNameSnapshot,
        companyVerified: false,
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
