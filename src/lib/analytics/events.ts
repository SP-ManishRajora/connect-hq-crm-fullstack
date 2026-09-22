/*
 * Website analytics — turning a posted beacon into a storable row.
 *
 * /api/track is open to the internet by necessity: it is called by a script in
 * a visitor's browser, which cannot hold a secret. So nothing here trusts its
 * input. Every field is capped, the event name is checked against a whitelist,
 * and the client's clock is never believed outright — a browser with a wrong
 * date would otherwise drop events into next year and corrupt every report.
 *
 * Pure and free of Prisma so it can be tested without a database, which is the
 * convention the rest of src/lib follows.
 */

/**
 * Event names we accept. A whitelist rather than free text: this column is
 * grouped by in every dashboard query, and one typo'd name silently becomes a
 * new row in every report.
 */
export const EVENT_NAMES = [
  "page_view",
  "session_start",
  "phone_click",
  "whatsapp_click",
  "lead_submit",
  "form_start",
  "scroll_depth",
  "outbound_click",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Events that represent a visitor asking to be contacted. */
export const CONVERSION_EVENTS: EventName[] = ["phone_click", "whatsapp_click", "lead_submit"];

export type RawEvent = Record<string, unknown>;

export type CleanEvent = {
  name: string;
  visitorId: string;
  sessionId: string;
  path: string;
  url: string | null;
  title: string | null;
  referrer: string | null;
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  websiteLeadId: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  meta: string | null;
  occurredAt: Date;
};

/** Trim, cap, and treat blank as absent. */
export function str(v: unknown, max: number): string | null {
  if (typeof v === "object" && v !== null) return null; // never stringify to "[object Object]"
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/**
 * The path a page view happened on, normalised for grouping.
 *
 * Query strings are stripped: `/green-park.html?gclid=abc` and
 * `/green-park.html?utm_source=x` are the same page, and keeping them apart
 * would scatter one page across hundreds of rows in the "top pages" table.
 * Attribution is captured in its own columns, so nothing is lost.
 */
export function normalisePath(raw: unknown): string {
  let p = String(raw ?? "").trim();
  if (!p) return "/";

  // Accept a full URL or a bare path.
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    /* fall through and treat it as a path */
  }

  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;

  // Trailing slash is noise except at the root.
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.slice(0, 500);
}

/**
 * Decide when an event happened.
 *
 * The browser's clock is advisory. A device with a badly wrong date would
 * otherwise write rows dated 2031, which no date-range report would ever show
 * and no retention prune would ever catch. Anything implausible falls back to
 * server time.
 */
export function resolveOccurredAt(clientTs: unknown, now: Date = new Date()): Date {
  const ms = typeof clientTs === "number" ? clientTs : Number(clientTs);
  if (!Number.isFinite(ms) || ms <= 0) return now;

  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return now;

  // Allow a little clock skew forward, and a day back for beacons that were
  // queued offline and replayed. Beyond that, trust the server.
  const FORWARD_MS = 5 * 60 * 1000;
  const BACK_MS = 24 * 60 * 60 * 1000;
  if (d.getTime() > now.getTime() + FORWARD_MS) return now;
  if (d.getTime() < now.getTime() - BACK_MS) return now;
  return d;
}

/**
 * Coarse device class from a user-agent string.
 *
 * Deliberately crude: the question this answers is "do enquiries come from
 * phones or desktops", not "which exact handset". Full UA strings are not
 * stored — they are near-unique and turn a pseudonymous row into a fingerprint.
 */
export function classifyDevice(ua: string | null | undefined): {
  device: string | null;
  browser: string | null;
  os: string | null;
} {
  const s = String(ua ?? "");
  if (!s) return { device: null, browser: null, os: null };

  const tablet = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s);
  const mobile = /Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(s);
  const device = tablet ? "tablet" : mobile ? "mobile" : "desktop";

  // Order matters: Edge and Chrome both claim "Chrome"; Chrome claims "Safari".
  const browser =
    /Edg\//i.test(s) ? "Edge" :
    /OPR\/|Opera/i.test(s) ? "Opera" :
    /Chrome\//i.test(s) ? "Chrome" :
    /Firefox\//i.test(s) ? "Firefox" :
    /Safari\//i.test(s) ? "Safari" :
    null;

  const os =
    /Windows/i.test(s) ? "Windows" :
    /iPhone|iPad|iPod|iOS/i.test(s) ? "iOS" :
    /Mac OS X/i.test(s) ? "macOS" :
    /Android/i.test(s) ? "Android" :
    /Linux/i.test(s) ? "Linux" :
    null;

  return { device, browser, os };
}

/**
 * Reduce an IP to something that separates visitors without locating one.
 *
 * IPv4 keeps the first three octets, IPv6 the first four groups. Enough to tell
 * two visitors behind one office NAT apart; not enough to identify a household.
 * Storing the full address would make this table personal data under the DPDP
 * Act for no analytical gain.
 */
export function ipPrefix(ip: string | null | undefined): string | null {
  let s = String(ip ?? "").trim();
  if (!s) return null;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) is what a dual-stack server sees for an
  // ordinary IPv4 client. Unwrap it first, or every such visitor is truncated
  // by the IPv6 rule and keeps their full address.
  const mapped = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) s = mapped[1];

  if (s.includes(":")) {
    const groups = s.split(":").filter(Boolean).slice(0, 4);
    return groups.length ? groups.join(":") + "::" : null;
  }

  const parts = s.split(".");
  if (parts.length !== 4 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

/**
 * Validate and normalise one posted event.
 *
 * Returns null when the event is unusable, so the caller can drop it and keep
 * the rest of the batch: one bad row in a beacon of ten must not cost the
 * other nine.
 */
export function cleanEvent(raw: RawEvent, now: Date = new Date()): CleanEvent | null {
  if (!raw || typeof raw !== "object") return null;

  const name = str(raw.name, 64);
  if (!name || !(EVENT_NAMES as readonly string[]).includes(name)) return null;

  // Without these the row cannot be grouped into a session or a journey, which
  // is the entire point of storing it.
  const visitorId = str(raw.visitorId, 64);
  const sessionId = str(raw.sessionId, 64);
  if (!visitorId || !sessionId) return null;

  // Extras are stored as JSON. Anything unserialisable is dropped rather than
  // failing the event.
  let meta: string | null = null;
  if (raw.meta && typeof raw.meta === "object") {
    try {
      const s = JSON.stringify(raw.meta);
      meta = s && s !== "{}" ? s.slice(0, 2000) : null;
    } catch {
      meta = null;
    }
  }

  return {
    name,
    visitorId,
    sessionId,
    path: normalisePath(raw.path ?? raw.url),
    url: str(raw.url, 1000),
    title: str(raw.title, 300),
    referrer: str(raw.referrer, 1000),
    gclid: str(raw.gclid, 512),
    utmSource: str(raw.utmSource, 191),
    utmMedium: str(raw.utmMedium, 191),
    utmCampaign: str(raw.utmCampaign, 191),
    utmTerm: str(raw.utmTerm, 191),
    utmContent: str(raw.utmContent, 191),
    websiteLeadId: str(raw.websiteLeadId, 64),
    device: null,
    browser: null,
    os: null,
    meta,
    occurredAt: resolveOccurredAt(raw.ts, now),
  };
}

/**
 * Clean a whole posted batch.
 *
 * Capped so one request cannot insert unbounded rows — the tracker sends a
 * handful at a time, so anything larger is either a bug or an attack.
 */
export const MAX_BATCH = 25;

export function cleanBatch(raw: unknown, now: Date = new Date()): CleanEvent[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: CleanEvent[] = [];
  for (const item of list.slice(0, MAX_BATCH)) {
    const e = cleanEvent(item as RawEvent, now);
    if (e) out.push(e);
  }
  return out;
}
