/*
 * Campaign attribution for website leads — what to show, and whether to show it.
 *
 * connecthq.co.in captures gclid/utm_* on a visitor's first arrival and persists
 * them, so a lead that lands from an ad, browses for a week and only then
 * submits still carries the click that paid for it. /api/leads/public stores
 * those values on the Lead; this decides how they are presented.
 *
 * Kept out of the component and free of React so it can be tested as a pure
 * function, which is the convention the rest of src/lib follows.
 */

/** The attribution columns on Lead. All optional — most leads carry none. */
export type LeadAttributionFields = {
  gclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  websiteLeadId?: string | null;
};

export type AttributionRow = { label: string; value: string };

export type AttributionView = {
  /** False for organic and direct leads — the panel is hidden entirely. */
  show: boolean;
  /** True when a Google click paid for this lead. Drives the badge. */
  paid: boolean;
  /** The gclid, for the badge tooltip. Needed to upload the closed deal to Google. */
  gclid: string | null;
  /** Only the fields this lead actually has, in reading order. */
  rows: AttributionRow[];
};

// Reading order: who sent them, then which campaign, then where they landed.
// `gclid` is deliberately absent — it is ~100 opaque characters that nobody
// reads, so it is surfaced as a badge rather than as a row.
const LABELS: [keyof LeadAttributionFields, string][] = [
  ["utmSource", "Source"],
  ["utmMedium", "Medium"],
  ["utmCampaign", "Campaign"],
  ["utmTerm", "Keyword"],
  ["utmContent", "Ad content"],
  ["landingPage", "Landed on"],
  ["referrer", "Referrer"],
  ["websiteLeadId", "Web ref"],
];

/**
 * Decide what the attribution panel shows for one lead.
 *
 * Hidden entirely when there is nothing to say, rather than rendered as a row
 * of dashes: most leads arrive organically, and an empty section on every one
 * of them would push the notes and status controls down the page for nothing.
 */
export function attributionView(lead: LeadAttributionFields | null | undefined): AttributionView {
  const rows: AttributionRow[] = [];
  for (const [key, label] of LABELS) {
    // Whitespace-only values are treated as absent: the endpoint stores null
    // for these, but leads imported from elsewhere are not guaranteed to.
    const value = String(lead?.[key] ?? "").trim();
    if (value) rows.push({ label, value });
  }

  const gclid = String(lead?.gclid ?? "").trim() || null;
  const paid = gclid !== null;

  // A gclid with no utm_* is normal — Ads auto-tagging sets gclid alone — so
  // the badge alone is reason enough to show the panel.
  return { show: paid || rows.length > 0, paid, gclid, rows };
}
