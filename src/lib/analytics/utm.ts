import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { QUALIFIED_STAGES, WON_STAGES } from "@/lib/analytics/funnel";

/*
 * UTM reporting — any dimension, against real outcomes.
 *
 * The CRM has been storing all five UTM parameters since the first lead form
 * landed, but only utm_campaign was ever shown. That meant the keyword that
 * produced a sale (utm_term) and the ad creative that produced it (utm_content)
 * were sitting in the database, unreadable. This module surfaces all of them
 * through one generic breakdown rather than five near-identical queries.
 *
 * Every figure here comes from the Lead table, not from WebEvent. Sessions are
 * a browser-side count that ad-blockers suppress; a lead is a row we hold.
 * Where a number is used to judge ad spend, it has to be the one that cannot be
 * blocked.
 */

/** The dimensions a breakdown can group by. */
export const UTM_DIMENSIONS = {
  utmSource: { label: "Source", hint: "Where the visit came from — google, facebook, newsletter" },
  utmMedium: { label: "Medium", hint: "How it arrived — cpc, organic, email, social" },
  utmCampaign: { label: "Campaign", hint: "The campaign name you set in the ad platform" },
  utmTerm: { label: "Keyword", hint: "The search keyword that triggered the ad" },
  utmContent: { label: "Ad variant", hint: "Which creative or link was clicked" },
} as const;

export type UtmDimension = keyof typeof UTM_DIMENSIONS;

/** Shown in place of an absent dimension, and accepted as a filter value. */
export const NOT_SET = "(not set)";

export function isUtmDimension(v: string | undefined | null): v is UtmDimension {
  return !!v && Object.prototype.hasOwnProperty.call(UTM_DIMENSIONS, v);
}

/**
 * Filters narrowing a breakdown, so the explorer can drill in: pick Source =
 * google, then break down by Keyword.
 */
export type UtmFilters = Partial<Record<UtmDimension, string>>;

export type Range = { from: Date; to: Date; days: number };

export type UtmRow = {
  /** The value, or "(not set)" when the dimension is absent. */
  value: string;
  /** Null when the dimension was genuinely absent — used for drill-down links. */
  raw: string | null;
  leads: number;
  qualified: number;
  customers: number;
  value_inr: number;
  withGclid: number;
};

/**
 * Break leads down by one UTM dimension.
 *
 * Grouped by dimension AND status in a single query, then folded in JS. The
 * alternative — one count query per stage per row — turns a page load into
 * dozens of round trips as soon as there are a few campaigns.
 */
export async function getUtmBreakdown(
  dimension: UtmDimension,
  r: Range,
  filters: UtmFilters = {},
  limit = 25,
): Promise<UtmRow[]> {
  const where: Prisma.LeadWhereInput = { createdAt: { gte: r.from, lte: r.to } };
  for (const [k, v] of Object.entries(filters)) {
    if (!v) continue;
    // "(not set)" in a filter means "rows where this dimension is missing",
    // so a drill-down into the unattributed bucket works like any other.
    (where as Record<string, unknown>)[k] = v === NOT_SET ? null : v;
  }

  const rows = await prisma.lead.groupBy({
    by: [dimension, "status"],
    where,
    _count: { _all: true },
    _sum: { budget: true },
  });

  // gclid presence is independent of status, so it needs its own pass.
  const gclidRows = await prisma.lead.groupBy({
    by: [dimension],
    where: { ...where, NOT: { gclid: null } },
    _count: { _all: true },
  });
  const gclidBy = new Map(
    gclidRows.map((g) => [(g as Record<string, unknown>)[dimension] as string | null ?? "", g._count._all]),
  );

  const byValue = new Map<string, UtmRow>();
  for (const row of rows) {
    const rawValue = (row as Record<string, unknown>)[dimension] as string | null;
    const key = rawValue ?? "";
    const entry =
      byValue.get(key) ??
      ({
        value: rawValue || NOT_SET,
        raw: rawValue,
        leads: 0,
        qualified: 0,
        customers: 0,
        value_inr: 0,
        withGclid: gclidBy.get(key) ?? 0,
      } satisfies UtmRow);

    const n = row._count._all;
    entry.leads += n;
    if (QUALIFIED_STAGES.includes(row.status)) entry.qualified += n;
    if (WON_STAGES.includes(row.status)) {
      entry.customers += n;
      entry.value_inr += row._sum.budget ?? 0;
    }
    byValue.set(key, entry);
  }

  return [...byValue.values()]
    // Customers first: a dimension value with many leads and no customers is
    // the one costing money, and sorting by leads would bury that.
    .sort((a, b) => b.customers - a.customers || b.leads - a.leads)
    .slice(0, limit);
}

export type SourceMediumRow = {
  source: string;
  medium: string;
  label: string;
  leads: number;
  qualified: number;
  customers: number;
  value_inr: number;
};

/**
 * The source/medium pair, which is how channels are conventionally named:
 * "google / cpc" is paid search, "google / organic" is SEO, and treating them
 * as one "google" hides the distinction that matters most.
 */
export async function getSourceMedium(r: Range, limit = 20): Promise<SourceMediumRow[]> {
  const rows = await prisma.lead.groupBy({
    by: ["utmSource", "utmMedium", "status"],
    where: { createdAt: { gte: r.from, lte: r.to } },
    _count: { _all: true },
    _sum: { budget: true },
  });

  const byPair = new Map<string, SourceMediumRow>();
  for (const row of rows) {
    const source = row.utmSource || "(direct)";
    const medium = row.utmMedium || "(none)";
    const key = `${source} / ${medium}`;
    const entry =
      byPair.get(key) ??
      ({ source, medium, label: key, leads: 0, qualified: 0, customers: 0, value_inr: 0 } satisfies SourceMediumRow);

    const n = row._count._all;
    entry.leads += n;
    if (QUALIFIED_STAGES.includes(row.status)) entry.qualified += n;
    if (WON_STAGES.includes(row.status)) {
      entry.customers += n;
      entry.value_inr += row._sum.budget ?? 0;
    }
    byPair.set(key, entry);
  }

  return [...byPair.values()]
    .sort((a, b) => b.customers - a.customers || b.leads - a.leads)
    .slice(0, limit);
}

export type TrendPoint = {
  /** Bucket start, as yyyy-MM-dd. */
  period: string;
  [series: string]: string | number;
};

export type TrendResult = {
  points: TrendPoint[];
  /** The series present, so the chart knows which lines to draw. */
  series: string[];
};

/**
 * Leads over time, split into one series per value of a dimension.
 *
 * Bucketed by week when the range is long enough, by day otherwise: thirty
 * daily points across five campaigns is unreadable, and a quarter of daily
 * points is worse. Empty buckets are filled with zeroes so a gap in a campaign
 * draws as a drop rather than the line jumping over it.
 */
export async function getUtmTrend(
  dimension: UtmDimension,
  r: Range,
  opts: { top?: number; metric?: "leads" | "customers" } = {},
): Promise<TrendResult> {
  const top = opts.top ?? 5;
  const metric = opts.metric ?? "leads";

  // Which values are worth drawing. Everything else would be a hairball.
  const leaders = await getUtmBreakdown(dimension, r, {}, top);
  const series = leaders
    .filter((l) => (metric === "customers" ? l.customers > 0 : l.leads > 0))
    .map((l) => l.value);

  if (!series.length) return { points: [], series: [] };

  const weekly = r.days > 45;
  const wonList = WON_STAGES;

  // Raw SQL: grouping by an ISO week in Prisma's API is not expressible, and
  // pulling every lead into JS to bucket it does not scale.
  const col = Prisma.raw(`\`${dimension}\``);
  const bucket = weekly
    ? Prisma.raw("DATE(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY))")
    : Prisma.raw("DATE(createdAt)");

  const rows = await prisma.$queryRaw<{ period: Date | string; k: string | null; n: bigint }[]>`
    SELECT ${bucket} AS period,
           ${col}    AS k,
           ${metric === "customers"
             ? Prisma.sql`SUM(status IN (${Prisma.join(wonList)}))`
             : Prisma.sql`COUNT(*)`} AS n
      FROM \`Lead\`
     WHERE createdAt >= ${r.from} AND createdAt <= ${r.to}
     GROUP BY period, k
     ORDER BY period`;

  // Build every bucket in range first, so a quiet week is a zero and not a gap.
  const step = weekly ? 7 : 1;
  const points = new Map<string, TrendPoint>();
  const start = new Date(r.from);
  if (weekly) {
    // Align to Monday, matching WEEKDAY() above.
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
  }
  for (let d = new Date(start); d <= r.to; d.setDate(d.getDate() + step)) {
    const key = d.toISOString().slice(0, 10);
    const p: TrendPoint = { period: key };
    for (const s of series) p[s] = 0;
    points.set(key, p);
  }

  for (const row of rows) {
    const key = String(
      row.period instanceof Date ? row.period.toISOString().slice(0, 10) : row.period,
    ).slice(0, 10);
    const name = row.k || NOT_SET;
    if (!series.includes(name)) continue; // outside the top N
    const p = points.get(key);
    if (!p) continue;
    p[name] = Number(p[name] ?? 0) + Number(row.n);
  }

  return { points: [...points.values()], series };
}

export type UtmCoverage = {
  totalLeads: number;
  /** Leads carrying at least one UTM parameter. */
  tagged: number;
  perDimension: { dimension: UtmDimension; label: string; filled: number }[];
};

/**
 * How much of the lead flow is actually tagged.
 *
 * Without this the breakdowns are quietly misleading: a "(not set)" row that is
 * 80% of leads means the tagging is broken, not that most business is direct.
 */
export async function getUtmCoverage(r: Range): Promise<UtmCoverage> {
  const where = { createdAt: { gte: r.from, lte: r.to } };
  const dims = Object.keys(UTM_DIMENSIONS) as UtmDimension[];

  const [totalLeads, tagged, ...counts] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({
      where: { ...where, OR: dims.map((d) => ({ [d]: { not: null } })) },
    }),
    ...dims.map((d) => prisma.lead.count({ where: { ...where, NOT: { [d]: null } } })),
  ]);

  return {
    totalLeads,
    tagged,
    perDimension: dims.map((d, i) => ({
      dimension: d,
      label: UTM_DIMENSIONS[d].label,
      filled: counts[i],
    })),
  };
}
