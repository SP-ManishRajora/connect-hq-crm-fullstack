/*
 * Website phone taps — interpretation.
 *
 * A phone_click WebEvent says a visitor tapped one of the site's tel: links.
 * It is not a call: the visitor may never dial, and a call that does follow
 * arrives on a salesperson's phone with no campaign attached. This file turns
 * the raw rows into something sales can match an incoming call against, and
 * the report into numbers marketing can judge placements and campaigns on.
 *
 * Pure functions only, no Prisma, so they can be tested directly — the queries
 * live in phone.ts.
 */

/** Where on the page the tapped link sat, as chq-track.js reports it. */
export const PLACEMENTS: Record<string, string> = {
  header: "Header / nav",
  sticky_bar: "Sticky call bar",
  footer: "Footer",
  modal: "Pop-up",
  form: "Enquiry form",
  contact_card: "Contact card",
  page_body: "Page content",
  unknown: "Unknown",
};

/**
 * Classes the site used on phone links before chq-track.js reported a
 * placement. Lets taps recorded earlier still land in a sensible bucket
 * instead of all reading "Unknown".
 */
const LEGACY_CLASS_PLACEMENT: [RegExp, string][] = [
  [/\bsticky-call\b/, "sticky_bar"],
  [/\b(nav-phone|top-phone)\b/, "header"],
  [/\b(f-contact|foot-address)\b/, "footer"],
  [/\bcontact-link-card\b/, "contact_card"],
  [/\bchq-modal-btn\b/, "modal"],
];

export type TapMeta = { place: string; number: string | null };

/** Read a phone_click's meta JSON, tolerating rows written by older trackers. */
export function parseTapMeta(meta: string | null | undefined): TapMeta {
  let o: Record<string, unknown> = {};
  try {
    const parsed = meta ? JSON.parse(meta) : null;
    if (parsed && typeof parsed === "object") o = parsed as Record<string, unknown>;
  } catch {
    // Unparseable meta is treated as absent rather than failing the report.
  }

  const number = typeof o.number === "string" && o.number ? o.number : null;

  if (typeof o.place === "string" && o.place) {
    return { place: PLACEMENTS[o.place] ? o.place : "unknown", number };
  }

  const where = typeof o.where === "string" ? o.where : "";
  for (const [re, place] of LEGACY_CLASS_PLACEMENT) {
    if (re.test(where)) return { place, number };
  }
  return { place: where && where !== "unclassed" ? "page_body" : "unknown", number };
}

export function placementLabel(place: string): string {
  return PLACEMENTS[place] ?? place;
}

export type Channel = "google_ads" | "paid" | "campaign" | "organic_search" | "social" | "referral" | "direct";

export const CHANNEL_LABELS: Record<Channel, string> = {
  google_ads: "Google Ads",
  paid: "Other paid",
  campaign: "Tagged campaign",
  organic_search: "Organic search",
  social: "Social",
  referral: "Referral",
  direct: "Direct",
};

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|display|cpm)$/i;
const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu)\./i;
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|linkedin|lnkd|twitter|x|t|youtube|pinterest|reddit)\.(com|co|in)$/i;

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Which channel brought the visitor who tapped.
 *
 * `landingReferrer` must be the referrer of the session's FIRST page view, not
 * of the page the tap happened on: by the time someone taps Call they have
 * usually clicked through two of our own pages, and that referrer is us.
 * `ownHost` is excluded for the same reason, in case the landing page itself
 * was reached from another page on the site in an earlier session.
 */
export function tapChannel(t: {
  gclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  landingReferrer?: string | null;
  ownHost?: string;
}): Channel {
  if (t.gclid) return "google_ads";
  if (t.utmMedium && PAID_MEDIUMS.test(t.utmMedium.trim())) return "paid";
  if (t.utmSource) return "campaign";

  const host = hostOf(t.landingReferrer);
  const own = (t.ownHost || "connecthq.co.in").toLowerCase();
  if (!host || host === own || host.endsWith("." + own)) return "direct";
  if (SEARCH_HOSTS.test(host)) return "organic_search";
  if (SOCIAL_HOSTS.test(host)) return "social";
  return "referral";
}

export type Tap = {
  id: string;
  occurredAt: Date;
  visitorId: string;
  path: string;
  place: string;
  channel: Channel;
  utmCampaign: string | null;
  leadId: string | null;
};

export type Bucket = { key: string; label: string; taps: number; leads: number };

export type TapSummary = {
  taps: number;
  visitors: number;
  /** Taps a salesperson has matched to a call and turned into a lead. */
  logged: number;
  paidTaps: number;
  byPlacement: Bucket[];
  byChannel: Bucket[];
  byPage: Bucket[];
  byCampaign: Bucket[];
};

function bucket(taps: Tap[], keyOf: (t: Tap) => string, labelOf: (k: string) => string, limit?: number): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const t of taps) {
    const key = keyOf(t);
    const b = m.get(key) ?? { key, label: labelOf(key), taps: 0, leads: 0 };
    b.taps += 1;
    if (t.leadId) b.leads += 1;
    m.set(key, b);
  }
  const rows = [...m.values()].sort((a, b) => b.taps - a.taps || a.label.localeCompare(b.label));
  return limit ? rows.slice(0, limit) : rows;
}

/**
 * Roll a range of taps up into the report's tables.
 *
 * Done in JS rather than SQL: phone taps are a few hundred a month, and the
 * channel needs the session's landing referrer, which is a second lookup
 * anyway. One pass over already-loaded rows keeps every table consistent with
 * the list printed under it.
 */
export function summariseTaps(taps: Tap[]): TapSummary {
  return {
    taps: taps.length,
    visitors: new Set(taps.map((t) => t.visitorId)).size,
    logged: taps.filter((t) => t.leadId).length,
    paidTaps: taps.filter((t) => t.channel === "google_ads" || t.channel === "paid").length,
    byPlacement: bucket(taps, (t) => t.place, placementLabel),
    byChannel: bucket(taps, (t) => t.channel, (k) => CHANNEL_LABELS[k as Channel] ?? k),
    byPage: bucket(taps, (t) => t.path, (k) => k, 10),
    byCampaign: bucket(taps, (t) => t.utmCampaign || "", (k) => k || "(no campaign)", 10),
  };
}

/** "3 min ago" style age, for spotting the tap that matches a ringing phone. */
export function tapAge(at: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}
