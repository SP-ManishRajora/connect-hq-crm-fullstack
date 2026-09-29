import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { logAction } from "@/lib/audit";
import { isValidEmail, isValidIndianPhone, normaliseIndianPhone } from "@/lib/validators";
import { getPhoneTap } from "@/lib/analytics/phone";
import { placementLabel } from "@/lib/analytics/phoneTap";
import { ownNumbers } from "@/lib/inboundCall";
import { normalisePhone } from "@/lib/voice";

// POST /api/analytics/phone-taps/:id/lead — "this call came from that tap".
//
// A salesperson takes a call, finds the matching tap on the Website Calls
// report, and logs it here. The website knew the campaign; the phone call did
// not. This is where the two meet:
//
//   - a new lead is created carrying the tap's gclid/utm_* and landing page, or
//     an existing lead with the same number is reused, and only its EMPTY
//     attribution fields are filled — a lead that already came in through the
//     form keeps the campaign it arrived with;
//   - an INBOUND CallLog with callSource WEBSITE is written, which is what the
//     funnel's "Calls from website" counts;
//   - a timeline comment records where on the site the caller tapped.
//
// With a gclid on the lead, its eventual sale joins the Google Ads offline
// conversion queue exactly like a form lead.

const LEAD_SOURCE = "WEBSITE_CALL";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !(await canAccessAsync(u.role, "leads", u.allowedModules))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 191);
  const phoneRaw = String(b.phone ?? "").trim();
  const emailRaw = String(b.email ?? "").trim();
  const notes = String(b.notes ?? "").trim().slice(0, 5000);

  if (!phoneRaw || !isValidIndianPhone(phoneRaw)) {
    return NextResponse.json(
      { error: "Enter the caller's 10-digit Indian mobile number (starts 6-9)." },
      { status: 400 },
    );
  }
  if (emailRaw && !isValidEmail(emailRaw)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const phone = normaliseIndianPhone(phoneRaw) as string;

  const tap = await getPhoneTap(params.id);
  if (!tap) return NextResponse.json({ error: "Phone tap not found." }, { status: 404 });
  const e = tap.event;

  const already = await prisma.lead.findUnique({
    where: { phoneClickEventId: e.id },
    select: { id: true, name: true },
  });
  if (already) {
    return NextResponse.json(
      { error: `This tap is already logged as ${already.name}.`, leadId: already.id },
      { status: 409 },
    );
  }

  // Matched automatically to a FreJun inbound call (lib/inboundCallStore.ts).
  const matched = await prisma.callLog.findUnique({
    where: { phoneClickEventId: e.id },
    select: { leadId: true, lead: { select: { name: true } } },
  });
  if (matched) {
    return NextResponse.json(
      {
        error: matched.lead
          ? `This tap was matched automatically to a call from ${matched.lead.name}.`
          : "This tap was matched automatically to a call.",
        leadId: matched.leadId,
      },
      { status: 409 },
    );
  }

  // Same caller, earlier enquiry. Matched on the last ten digits so leads stored
  // before normalisation (+91…, 0…) are still found.
  const existing = await prisma.lead.findFirst({
    where: { phone: { endsWith: phone } },
    orderBy: { createdAt: "desc" },
  });

  if (!existing && !name) {
    return NextResponse.json({ error: "Name is required for a new lead." }, { status: 400 });
  }

  const attribution = {
    gclid: e.gclid,
    utmSource: e.utmSource,
    utmMedium: e.utmMedium,
    utmCampaign: e.utmCampaign,
    utmTerm: e.utmTerm,
    utmContent: e.utmContent,
    landingPage: tap.landingPage,
    referrer: tap.referrer,
    websiteLeadId: e.websiteLeadId,
  };

  const where = placementLabel(tap.meta.place).toLowerCase();
  const note =
    `Inbound call from the website — tapped the ${where} number on ${e.path}` +
    (e.utmCampaign ? ` (campaign: ${e.utmCampaign})` : e.gclid ? " (Google Ads click)" : "") +
    (notes ? `\n${notes}` : "");

  try {
    const result = await prisma.$transaction(async (tx) => {
      let leadId: string;
      let created: boolean;

      if (existing) {
        // Fill gaps only. Overwriting would move a lead that arrived through a
        // form last week onto whatever campaign they happened to tap from today.
        // A repeat caller keeps the link to their first tap; this one is still
        // recorded, as the CallLog and comment below.
        const fill: Record<string, unknown> = existing.phoneClickEventId ? {} : { phoneClickEventId: e.id };
        for (const [k, v] of Object.entries(attribution)) {
          const cur = (existing as Record<string, unknown>)[k];
          if (v && (cur === null || cur === undefined || cur === "")) fill[k] = v;
        }
        if (emailRaw && !existing.email) fill.email = emailRaw;
        await tx.lead.update({ where: { id: existing.id }, data: fill });
        leadId = existing.id;
        created = false;
      } else {
        const lead = await tx.lead.create({
          data: {
            source: LEAD_SOURCE,
            name,
            phone,
            email: emailRaw || null,
            notes: notes || null,
            ownerId: u.id,
            phoneClickEventId: e.id,
            ...attribution,
          },
        });
        leadId = lead.id;
        created = true;
      }

      // FreJun may already have logged this call without a tap, when more than
      // one tap preceded it. Claim that row rather than logging the call twice.
      const logged = await tx.callLog.findFirst({
        where: {
          direction: "INBOUND",
          provider: "frejun",
          phoneClickEventId: null,
          leadPhone: { endsWith: phone },
          startedAt: {
            gte: new Date(e.occurredAt.getTime() - 60_000),
            lte: new Date(e.occurredAt.getTime() + 30 * 60_000),
          },
        },
        orderBy: { startedAt: "asc" },
      });

      if (logged) {
        const own = ownNumbers();
        const tapped = normalisePhone(tap.meta.number);
        await tx.callLog.update({
          where: { id: logged.id },
          data: {
            leadId,
            callSource: tapped && !own.has(tapped) ? "GOOGLE_ADS" : "WEBSITE",
            gclid: e.gclid,
            phoneClickEventId: e.id,
          },
        });
      } else {
        await tx.callLog.create({
          data: {
            leadId,
            agentId: u.id,
            direction: "INBOUND",
            status: "COMPLETED",
            leadPhone: phone,
            provider: "manual",
            callSource: "WEBSITE",
            phoneClickEventId: e.id,
            // When the visitor tapped — the call follows within seconds, and this
            // keeps the funnel's date range honest when it is logged hours later.
            startedAt: e.occurredAt,
          },
        });
      }

      await tx.comment.create({
        data: { leadId, body: note, channel: "CALL", authorId: u.id },
      });

      return { leadId, created };
    });

    await logAction({
      userId: u.id,
      action: result.created ? "LEAD_FROM_PHONE_TAP" : "PHONE_TAP_LINKED",
      targetType: "Lead",
      targetId: result.leadId,
      meta: { webEventId: e.id, paid: !!e.gclid },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    // P2002: another salesperson logged the same tap a moment earlier.
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "This tap has just been logged by someone else." }, { status: 409 });
    }
    console.error("POST /api/analytics/phone-taps/:id/lead failed:", err);
    return NextResponse.json({ error: "Could not log the call." }, { status: 500 });
  }
}
