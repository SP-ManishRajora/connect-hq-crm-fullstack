import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

/*
 * Google Ads Lead Form webhook.
 *
 * Google posts here the moment someone submits a lead form extension on an ad,
 * so those leads land in the CRM beside website enquiries instead of sitting in
 * the Ads UI waiting to be downloaded as a CSV — by which time the lead is cold.
 *
 * Set up in Google Ads under the lead form asset:
 *   Webhook URL: https://crm.connecthq.co.in/api/leads/google-form
 *   Key:         the value of GOOGLE_LEAD_FORM_KEY
 * Google's "Send test data" button posts a payload with is_test = true, which
 * this accepts and acknowledges without storing.
 *
 * Authentication is the shared key Google echoes back in the body. That is all
 * Google offers — there is no signature — so the key is the whole credential
 * and is compared in constant time.
 *
 * Always answers 200 for an authentic request, even one it cannot use. Google
 * retries failures for days and disables a webhook that keeps erroring, and a
 * payload we will never parse is not worth losing the endpoint over.
 */

/** Pull a value out of Google's column_data array, which is a list of pairs. */
function field(columns: unknown, ...ids: string[]): string | null {
  if (!Array.isArray(columns)) return null;
  for (const id of ids) {
    const hit = columns.find(
      (c) =>
        c &&
        typeof c === "object" &&
        String((c as Record<string, unknown>).column_id ?? "").toLowerCase() === id.toLowerCase(),
    ) as Record<string, unknown> | undefined;
    const v = hit?.string_value;
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

/** Constant-time compare, so the key cannot be recovered by timing the responses. */
function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.GOOGLE_LEAD_FORM_KEY?.trim();
  if (!expected) {
    // Refuse rather than accept anonymous writes: without a key configured,
    // anyone who finds this URL could create leads.
    console.error("[google-form] GOOGLE_LEAD_FORM_KEY is not set; rejecting webhook");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const given = String((body as Record<string, unknown>).google_key ?? "");
  if (!given || !keyMatches(given, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = body as Record<string, unknown>;

  // Google's test payload carries placeholder data. Acknowledge it so the
  // "Send test data" button reports success, but never store it as a lead.
  if (b.is_test_lead === true || b.is_test === true) {
    return NextResponse.json({ ok: true, test: true });
  }

  const columns = b.user_column_data;
  const name =
    field(columns, "FULL_NAME") ||
    [field(columns, "FIRST_NAME"), field(columns, "LAST_NAME")].filter(Boolean).join(" ").trim() ||
    null;
  const email = field(columns, "EMAIL");
  const phone = field(columns, "PHONE_NUMBER");
  const company = field(columns, "COMPANY_NAME");
  const city = field(columns, "CITY");

  // Same rule as the website form: a lead we cannot contact is not a lead.
  // Acknowledged rather than rejected, so Google does not retry it forever.
  if (!email && !phone) {
    console.warn("[google-form] lead with no contact detail, ignoring", { leadId: b.lead_id });
    return NextResponse.json({ ok: true, ignored: "no contact detail" });
  }

  const trim = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  // Google's own id for the submission. Stored in websiteLeadId — the column
  // already means "the id the originating system gave this enquiry", and
  // reusing it keeps one tracing path rather than two.
  const externalId = trim(b.lead_id, 64);

  // Google sends gclid on most lead form submissions; without one the lead is
  // still worth having, it simply cannot be uploaded as an offline conversion.
  const gclid = trim(b.gcl_id ?? b.gclid, 512);

  // Retries are expected — Google resends anything it did not get a 200 for.
  // Without this check a retry creates a duplicate lead that sales then calls
  // twice.
  if (externalId) {
    const existing = await prisma.lead.findFirst({
      where: { websiteLeadId: externalId, source: "GOOGLE_LEAD_FORM" },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }

  const notes = [
    "Submitted through a Google Ads lead form.",
    b.campaign_id ? `Campaign id: ${b.campaign_id}` : null,
    b.form_id ? `Form id: ${b.form_id}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const lead = await prisma.lead.create({
    data: {
      source: "GOOGLE_LEAD_FORM",
      // The CRM requires a name; a lead form may not collect one.
      name: trim(name, 200) || email || phone || "Google lead form",
      email: trim(email, 200),
      phone: trim(phone, 40),
      company: trim(company, 200),
      city: trim(city, 100),
      gclid,
      // These are the only two we can state as fact. Google does not send
      // utm_* for lead form submissions, and inventing them would put made-up
      // values into campaign reports.
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: trim(b.campaign_id, 191),
      websiteLeadId: externalId,
      notes: notes || null,
    },
  });

  return NextResponse.json({ ok: true, id: lead.id });
}
