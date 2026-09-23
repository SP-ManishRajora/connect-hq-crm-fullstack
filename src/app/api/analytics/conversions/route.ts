import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { getPendingConversions, WON_STAGES } from "@/lib/analytics/funnel";
import { uploadConversions, isAdsConfigured, explainAdsError } from "@/lib/analytics/ads";

/*
 * POST /api/analytics/conversions — report won leads to Google Ads.
 *
 * Session-protected and restricted to the analytics module: this spends nothing
 * but it does write to the company's ad account, and a conversion uploaded in
 * error skews bidding for weeks.
 *
 * Exactly-once is enforced by Lead.conversionUploadedAt, which is set only for
 * the rows Google actually accepted. A partial failure therefore leaves the
 * failed rows pending and they are retried on the next run, rather than being
 * silently marked done.
 */

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAdsConfigured()) {
    return NextResponse.json(
      { error: "Google Ads is not configured. See docs/conversion-tracking.md." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const onlyIds: string[] | null = Array.isArray(body?.leadIds) ? body.leadIds.map(String) : null;

  let pending = await getPendingConversions(200);
  if (onlyIds) pending = pending.filter((p) => onlyIds.includes(p.id));

  if (!pending.length) {
    return NextResponse.json({ ok: true, uploaded: 0, message: "Nothing to upload." });
  }

  // Enhanced conversions need the contact details, which getPendingConversions
  // deliberately does not select — they are only ever read here, hashed, and
  // never stored or logged.
  const contacts = await prisma.lead.findMany({
    where: { id: { in: pending.map((p) => p.id) } },
    select: { id: true, email: true, phone: true, updatedAt: true },
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  try {
    const result = await uploadConversions(
      pending.map((p) => {
        const c = contactById.get(p.id);
        return {
          gclid: p.gclid,
          // When the lead became a customer, not when it arrived. Google
          // rejects a conversion dated before its click, and using createdAt
          // would report the enquiry date as the sale date.
          conversionDateTime: c?.updatedAt ?? new Date(),
          value: p.value,
          email: c?.email,
          phone: c?.phone,
          // Our lead id, so a re-upload updates rather than duplicates.
          orderId: p.id,
        };
      }),
    );

    // Mark only what Google accepted. Rows that failed stay pending so the next
    // run retries them — the alternative silently loses conversions.
    const failed = new Set(result.errors.map((e) => e.index).filter((i) => i >= 0));
    const accepted = pending.filter((_, i) => !failed.has(i));

    if (accepted.length) {
      const now = new Date();
      const actionName = process.env.GOOGLE_ADS_CONVERSION_NAME || "CRM Customer";

      // One statement per lead, in a transaction: conversionValue records the
      // amount actually sent to Google, which updateMany cannot vary per row.
      // Storing it is the point — budget can be edited afterwards, and the
      // audit trail must show what was reported, not what the lead says today.
      await prisma.$transaction(
        accepted.map((a) =>
          prisma.lead.update({
            where: { id: a.id },
            data: {
              conversionUploadedAt: now,
              conversionUploadedName: actionName,
              conversionValue: a.value && a.value > 0 ? a.value : null,
            },
          }),
        ),
      );
    }

    return NextResponse.json({
      ok: result.ok,
      uploaded: accepted.length,
      failed: result.errors.length,
      errors: result.errors.map((e) => ({
        lead: e.index >= 0 ? pending[e.index]?.name : null,
        message: e.message,
      })),
    });
  } catch (err) {
    console.error("[conversions] upload failed", err);
    return NextResponse.json({ error: explainAdsError(err) }, { status: 502 });
  }
}

/** GET — what is waiting to be uploaded, for the dashboard. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [pending, noGclid] = await Promise.all([
    getPendingConversions(50),
    // Won leads with no click id. Not failures — organic customers — but worth
    // showing so the gap between customers and uploads is explained rather than
    // looking like a bug.
    prisma.lead.count({
      where: { status: { in: WON_STAGES }, gclid: null },
    }),
  ]);

  return NextResponse.json({
    configured: isAdsConfigured(),
    pending: pending.length,
    noGclid,
    leads: pending,
  });
}
