import { prisma } from "@/lib/db";

/*
 * Website analytics reporting.
 *
 * Reads the WebEvent table written by /api/track. Kept apart from the page
 * component so the queries can be reused by an export or an API later, and so
 * the page stays about layout.
 *
 * Aggregation is done in SQL rather than by loading rows into JS: this is the
 * largest table in the database and a busy month is hundreds of thousands of
 * rows. Every query below is served by an index declared on the model.
 */

export type Range = { from: Date; to: Date; days: number };

/** A whole number of days back from now, clamped to something sane. */
export function rangeFromDays(days: number): Range {
  const d = Number.isFinite(days) ? Math.floor(days) : 30;
  const clamped = Math.min(Math.max(d, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - clamped * 24 * 60 * 60 * 1000);
  return { from, to, days: clamped };
}

export type Totals = {
  pageViews: number;
  sessions: number;
  visitors: number;
  phoneClicks: number;
  whatsappClicks: number;
  leadSubmits: number;
  /** Leads actually stored in the CRM over the same window. */
  leads: number;
  /** Of those, how many carried a Google click. */
  paidLeads: number;
};

export async function getTotals(r: Range): Promise<Totals> {
  const where = { occurredAt: { gte: r.from, lte: r.to } };

  const [byName, sessions, visitors, leads, paidLeads] = await Promise.all([
    prisma.webEvent.groupBy({ by: ["name"], where, _count: { _all: true } }),
    // distinct() on a groupBy is not available, so count distinct in SQL.
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT sessionId) AS n FROM WebEvent
       WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT visitorId) AS n FROM WebEvent
       WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}`,
    prisma.lead.count({ where: { createdAt: { gte: r.from, lte: r.to } } }),
    prisma.lead.count({
      where: { createdAt: { gte: r.from, lte: r.to }, NOT: { gclid: null } },
    }),
  ]);

  const count = (n: string) => byName.find((b) => b.name === n)?._count._all ?? 0;

  return {
    pageViews: count("page_view"),
    sessions: Number(sessions[0]?.n ?? 0),
    visitors: Number(visitors[0]?.n ?? 0),
    phoneClicks: count("phone_click"),
    whatsappClicks: count("whatsapp_click"),
    leadSubmits: count("lead_submit"),
    leads,
    paidLeads,
  };
}

export type DayPoint = { day: string; pageViews: number; conversions: number };

/**
 * Page views and contact attempts per day, for the trend chart.
 *
 * Days with no traffic are filled in as zeroes: a line chart that silently skips
 * them draws a flat line across an outage and hides it.
 */
export async function getDaily(r: Range): Promise<DayPoint[]> {
  const rows = await prisma.$queryRaw<{ day: Date | string; name: string; n: bigint }[]>`
    SELECT DATE(occurredAt) AS day, name, COUNT(*) AS n
      FROM WebEvent
     WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}
       AND name IN ('page_view','phone_click','whatsapp_click','lead_submit')
     GROUP BY DATE(occurredAt), name`;

  const byDay = new Map<string, DayPoint>();
  for (let i = 0; i <= r.days; i++) {
    const d = new Date(r.from.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: key, pageViews: 0, conversions: 0 });
  }

  for (const row of rows) {
    // MySQL returns DATE as a Date or a string depending on driver settings.
    const key = String(row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day).slice(0, 10);
    const point = byDay.get(key);
    if (!point) continue;
    if (row.name === "page_view") point.pageViews += Number(row.n);
    else point.conversions += Number(row.n);
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export type CampaignRow = {
  campaign: string;
  source: string;
  sessions: number;
  conversions: number;
  /** Leads stored in the CRM attributed to this campaign. */
  leads: number;
};

/**
 * Traffic and outcome by campaign.
 *
 * Sessions come from WebEvent; leads come from the Lead table rather than from
 * lead_submit events, because a lead row is the thing that actually reached
 * sales. An ad-blocked visitor can still submit the form, so counting the
 * events would under-report exactly the number people care about.
 */
export async function getCampaigns(r: Range, limit = 12): Promise<CampaignRow[]> {
  const traffic = await prisma.$queryRaw<
    { campaign: string | null; source: string | null; sessions: bigint; conversions: bigint }[]
  >`
    SELECT utmCampaign AS campaign,
           MIN(utmSource) AS source,
           COUNT(DISTINCT sessionId) AS sessions,
           SUM(name IN ('phone_click','whatsapp_click','lead_submit')) AS conversions
      FROM WebEvent
     WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}
     GROUP BY utmCampaign
     ORDER BY sessions DESC
     LIMIT ${limit}`;

  const leadRows = await prisma.lead.groupBy({
    by: ["utmCampaign"],
    where: { createdAt: { gte: r.from, lte: r.to } },
    _count: { _all: true },
  });
  const leadsByCampaign = new Map(leadRows.map((l) => [l.utmCampaign ?? "", l._count._all]));

  return traffic.map((t) => {
    const key = t.campaign ?? "";
    return {
      // Direct and organic visits have no campaign; name them rather than
      // showing a blank row.
      campaign: t.campaign || "(direct / organic)",
      source: t.source || "—",
      sessions: Number(t.sessions),
      conversions: Number(t.conversions),
      leads: leadsByCampaign.get(key) ?? 0,
    };
  });
}

export type PageRow = { path: string; views: number; conversions: number };

export async function getTopPages(r: Range, limit = 12): Promise<PageRow[]> {
  const rows = await prisma.$queryRaw<{ path: string; views: bigint; conversions: bigint }[]>`
    SELECT path,
           SUM(name = 'page_view') AS views,
           SUM(name IN ('phone_click','whatsapp_click','lead_submit')) AS conversions
      FROM WebEvent
     WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}
     GROUP BY path
     ORDER BY views DESC
     LIMIT ${limit}`;
  return rows.map((p) => ({
    path: p.path,
    views: Number(p.views),
    conversions: Number(p.conversions),
  }));
}

export type Slice = { label: string; n: number };

export async function getDeviceSplit(r: Range): Promise<Slice[]> {
  const rows = await prisma.webEvent.groupBy({
    by: ["device"],
    where: { occurredAt: { gte: r.from, lte: r.to }, name: "page_view" },
    _count: { _all: true },
    orderBy: { _count: { device: "desc" } },
  });
  return rows.map((d) => ({ label: d.device || "unknown", n: d._count._all }));
}

/** Where visitors came from, for sessions with no campaign tag. */
export async function getTopReferrers(r: Range, limit = 8): Promise<Slice[]> {
  const rows = await prisma.$queryRaw<{ host: string | null; n: bigint }[]>`
    SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(referrer,'https://',''),'http://',''),'/',1),'?',1) AS host,
           COUNT(DISTINCT sessionId) AS n
      FROM WebEvent
     WHERE occurredAt >= ${r.from} AND occurredAt <= ${r.to}
       AND referrer IS NOT NULL AND referrer <> ''
     GROUP BY host
     ORDER BY n DESC
     LIMIT ${limit}`;
  return rows.filter((x) => x.host).map((x) => ({ label: x.host as string, n: Number(x.n) }));
}

/**
 * How long ago the last event arrived.
 *
 * Shown on the dashboard so a broken tracker looks broken. Without it, a site
 * that stopped reporting three weeks ago renders as a confident set of zeroes.
 */
export async function getLastEventAt(): Promise<Date | null> {
  const last = await prisma.webEvent.findFirst({
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  return last?.occurredAt ?? null;
}

/*
 * ---------------------------------------------------------------------------
 * Raw event inspection.
 *
 * Everything above answers "how is the site doing". The two below answer a
 * different question: "is the tracker sending what we think it is". They exist
 * because the aggregate dashboard cannot show that — a field the website never
 * populates and a field it populates wrongly both render as a quiet zero, and
 * the only way to tell them apart used to be an SSH session and a SQL prompt.
 * ---------------------------------------------------------------------------
 */

export type RawEventRow = {
  id: string;
  occurredAt: Date;
  createdAt: Date;
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
  ipPrefix: string | null;
  meta: string | null;
};

/**
 * The most recent events, unaggregated and unfiltered.
 *
 * Ordered by `createdAt`, not `occurredAt`: this view is for watching beacons
 * land while wiring up the website, and a beacon queued offline then replayed
 * carries an old `occurredAt` — ordering by it would hide the very event
 * someone is waiting to see. Both are shown so the lag is visible.
 */
export async function getRecentEvents(limit = 100, name?: string): Promise<RawEventRow[]> {
  const take = Math.min(Math.max(Math.floor(limit) || 100, 1), 500);
  return prisma.webEvent.findMany({
    where: name ? { name } : undefined,
    orderBy: { createdAt: "desc" },
    take,
  });
}

export type FieldCoverage = { field: string; filled: number; note: string };

/**
 * How many of the recent rows actually carry each optional field.
 *
 * This is the diagnostic the dashboard could never give: a zero here means the
 * website is not sending that field at all, which is a fixable frontend bug,
 * as opposed to a campaign genuinely having no traffic. Scoped to a recent
 * window rather than all time, so a field fixed last week reads as working
 * rather than being dragged down by months of older rows.
 */
export async function getFieldCoverage(r: Range): Promise<{ total: number; fields: FieldCoverage[] }> {
  const [row] = await prisma.$queryRaw<
    Record<string, bigint>[]
  >`
    SELECT COUNT(*)              AS total,
           COUNT(gclid)          AS gclid,
           COUNT(utmSource)      AS utmSource,
           COUNT(utmMedium)      AS utmMedium,
           COUNT(utmCampaign)    AS utmCampaign,
           COUNT(utmTerm)        AS utmTerm,
           COUNT(utmContent)     AS utmContent,
           COUNT(referrer)       AS referrer,
           COUNT(title)          AS title,
           COUNT(websiteLeadId)  AS websiteLeadId,
           COUNT(device)         AS device,
           COUNT(meta)           AS meta
      FROM WebEvent
     WHERE createdAt >= ${r.from} AND createdAt <= ${r.to}`;

  const n = (k: string) => Number(row?.[k] ?? 0);

  return {
    total: n("total"),
    fields: [
      { field: "utmSource", filled: n("utmSource"), note: "utm_source on the landing URL" },
      { field: "utmMedium", filled: n("utmMedium"), note: "utm_medium — not shown on the dashboard yet" },
      { field: "utmCampaign", filled: n("utmCampaign"), note: "Drives the campaign table" },
      { field: "utmTerm", filled: n("utmTerm"), note: "Your Ads keyword — not shown yet" },
      { field: "utmContent", filled: n("utmContent"), note: "Ad / creative variant — not shown yet" },
      { field: "gclid", filled: n("gclid"), note: "Google Ads click id. Needed for offline conversions" },
      { field: "referrer", filled: n("referrer"), note: "document.referrer" },
      { field: "title", filled: n("title"), note: "Page title" },
      { field: "websiteLeadId", filled: n("websiteLeadId"), note: "CHQ-… reference joining back to a Lead" },
      { field: "device", filled: n("device"), note: "Derived server-side from the user-agent" },
      { field: "meta", filled: n("meta"), note: "Per-event extras (scroll depth, form id)" },
    ],
  };
}

/** Event names seen recently, with counts — for the filter tabs. */
export async function getEventNameCounts(r: Range): Promise<Slice[]> {
  const rows = await prisma.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT name, COUNT(*) AS n
      FROM WebEvent
     WHERE createdAt >= ${r.from} AND createdAt <= ${r.to}
     GROUP BY name
     ORDER BY n DESC`;
  return rows.map((x) => ({ label: x.name, n: Number(x.n) }));
}
