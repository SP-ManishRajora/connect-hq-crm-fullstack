import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { fmtINR } from "@/lib/utils";
import { rangeFromDays } from "@/lib/analytics/report";
import {
  UTM_DIMENSIONS,
  NOT_SET,
  isUtmDimension,
  getUtmBreakdown,
  getSourceMedium,
  getUtmTrend,
  getUtmCoverage,
  type UtmDimension,
  type UtmFilters,
} from "@/lib/analytics/utm";
import { TrendChart, BreakdownChart, ShareChart } from "./UtmCharts";

export const dynamic = "force-dynamic";

/*
 * UTM explorer.
 *
 * Pick any dimension — source, medium, campaign, keyword, ad variant — and see
 * leads, qualified and customers broken down by it, with the others available
 * as filters to drill in.
 *
 * Everything is counted from the Lead table rather than from WebEvent. Those
 * browser-side counts are suppressed by ad-blockers, and this page exists to
 * judge ad spend, so it has to use the numbers that cannot be blocked.
 */

const RANGES = [7, 30, 90, 180];
const DIMS = Object.keys(UTM_DIMENSIONS) as UtmDimension[];

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

/** Preserve the current view when building a link that changes one thing. */
function linkTo(
  base: { days: number; dim: UtmDimension; metric: string; filters: UtmFilters },
  change: Partial<{ days: number; dim: UtmDimension; metric: string } & UtmFilters>,
): string {
  const p = new URLSearchParams();
  const days = change.days ?? base.days;
  const dim = (change.dim ?? base.dim) as UtmDimension;
  const metric = change.metric ?? base.metric;

  if (days !== 30) p.set("days", String(days));
  if (dim !== "utmCampaign") p.set("dim", dim);
  if (metric !== "leads") p.set("metric", metric);

  for (const d of DIMS) {
    const v = d in change ? (change as Record<string, string | undefined>)[d] : base.filters[d];
    if (v) p.set(d, v);
  }
  const q = p.toString();
  return q ? `/analytics/utm?${q}` : "/analytics/utm";
}

export default async function UtmPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }

  const range = rangeFromDays(Number(searchParams?.days ?? 30));
  const dim: UtmDimension = isUtmDimension(searchParams?.dim) ? searchParams.dim : "utmCampaign";
  const metric = searchParams?.metric === "customers" ? "customers" : "leads";

  // Filters are read only from known dimension keys, so an arbitrary query
  // parameter cannot reach the where clause.
  const filters: UtmFilters = {};
  for (const d of DIMS) {
    const v = searchParams?.[d];
    if (v) filters[d] = v;
  }

  const [rows, sourceMedium, trend, coverage] = await Promise.all([
    getUtmBreakdown(dim, range, filters),
    getSourceMedium(range),
    getUtmTrend(dim, range, { top: 5, metric }),
    getUtmCoverage(range),
  ]);

  const base = { days: range.days, dim, metric, filters };
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const totals = rows.reduce(
    (a, r) => ({
      leads: a.leads + r.leads,
      customers: a.customers + r.customers,
      value: a.value + r.value_inr,
    }),
    { leads: 0, customers: 0, value: 0 },
  );

  // Untagged share is the caveat that makes every other number readable.
  const untagged = coverage.totalLeads - coverage.tagged;
  const untaggedPct = coverage.totalLeads ? (untagged / coverage.totalLeads) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">UTM Explorer</h1>
          <p className="muted">
            Campaign parameters against real outcomes, last {range.days} days.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={linkTo(base, { days: d })}
              className={d === range.days ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {d}d
            </Link>
          ))}
          <Link href="/analytics/funnel" className="btn-ghost text-sm ml-2">Funnel</Link>
          <Link href="/analytics" className="btn-ghost text-sm">Traffic</Link>
        </div>
      </div>

      {/* Tagging health. A large untagged share makes every breakdown below a
          view of a minority of the business, which is worth saying loudly. */}
      {coverage.totalLeads > 0 && untaggedPct >= 40 && (
        <div className="card border-amber-300 bg-amber-50">
          <div className="font-semibold text-amber-900">
            {untaggedPct.toFixed(0)}% of leads carry no UTM tags
          </div>
          <p className="text-sm text-amber-800 mt-1">
            {untagged.toLocaleString("en-IN")} of {coverage.totalLeads.toLocaleString("en-IN")} leads
            arrived without campaign parameters — walk-ins, referrals and direct visits, but also
            any ad whose landing URL is untagged. The breakdowns below describe the tagged
            remainder, not all business.
          </p>
        </div>
      )}

      {/* ── Dimension picker ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="muted text-xs font-semibold">Break down by</span>
          {DIMS.map((d) => (
            <Link
              key={d}
              href={linkTo(base, { dim: d })}
              className={d === dim ? "btn-primary text-sm" : "btn-ghost text-sm"}
              title={UTM_DIMENSIONS[d].hint}
            >
              {UTM_DIMENSIONS[d].label}
            </Link>
          ))}
        </div>
        <p className="muted text-xs mt-2">{UTM_DIMENSIONS[dim].hint}</p>

        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t">
            <span className="muted text-xs font-semibold">Filtered by</span>
            {activeFilters.map(([k, v]) => (
              <Link
                key={k}
                href={linkTo(base, { [k]: undefined } as never)}
                className="text-xs px-2 py-1 rounded bg-brand-50 text-brand-700 hover:bg-brand-100"
                title="Remove this filter"
              >
                {UTM_DIMENSIONS[k as UtmDimension].label}: {v} ✕
              </Link>
            ))}
            <Link href={linkTo({ ...base, filters: {} }, {})} className="text-xs text-gray-500 underline">
              clear all
            </Link>
          </div>
        )}
      </div>

      {/* ── Trend ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="h2">
            {metric === "customers" ? "Customers" : "Leads"} over time — top 5 by{" "}
            {UTM_DIMENSIONS[dim].label.toLowerCase()}
          </h2>
          <div className="flex gap-1">
            <Link
              href={linkTo(base, { metric: "leads" })}
              className={metric === "leads" ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              Leads
            </Link>
            <Link
              href={linkTo(base, { metric: "customers" })}
              className={metric === "customers" ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              Customers
            </Link>
          </div>
        </div>
        <p className="muted text-xs mb-2">
          {range.days > 45 ? "Bucketed by week." : "Bucketed by day."} Shows whether a
          {" "}{UTM_DIMENSIONS[dim].label.toLowerCase()} is improving or decaying, not just its total.
        </p>
        <TrendChart points={trend.points} series={trend.series} metric={metric} />
      </div>

      {/* ── Breakdown chart + table ───────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">By {UTM_DIMENSIONS[dim].label.toLowerCase()}</h2>
        <p className="muted text-xs mb-3">
          Sorted by customers. A row with many leads and no customers is the expensive one.
          Click a value to filter every panel by it.
        </p>

        {rows.length === 0 ? (
          <p className="muted text-sm">No leads with this dimension in the selected range.</p>
        ) : (
          <>
            <BreakdownChart rows={rows} />

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2">{UTM_DIMENSIONS[dim].label}</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Qualified</th>
                    <th className="py-2 text-right">Customers</th>
                    <th className="py-2 text-right">Win rate</th>
                    <th className="py-2 text-right">Value</th>
                    <th className="py-2 text-right" title="Leads carrying a Google click id">
                      GCLID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.value} className="border-b last:border-0">
                      <td className="py-2 font-medium break-all">
                        <Link
                          href={linkTo(base, { [dim]: r.raw ?? NOT_SET } as never)}
                          className="text-brand-600 hover:underline"
                        >
                          {r.value}
                        </Link>
                      </td>
                      <td className="py-2 text-right">{r.leads.toLocaleString("en-IN")}</td>
                      <td className="py-2 text-right">{r.qualified.toLocaleString("en-IN")}</td>
                      <td className="py-2 text-right font-semibold">
                        {r.customers.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 text-right text-gray-500">{pct(r.customers, r.leads)}</td>
                      <td className="py-2 text-right">{r.value_inr ? fmtINR(r.value_inr) : "—"}</td>
                      <td className="py-2 text-right text-gray-500">
                        {r.withGclid}/{r.leads}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Total (shown)</td>
                    <td className="py-2 text-right">{totals.leads.toLocaleString("en-IN")}</td>
                    <td className="py-2" />
                    <td className="py-2 text-right">{totals.customers.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">{pct(totals.customers, totals.leads)}</td>
                    <td className="py-2 text-right">{totals.value ? fmtINR(totals.value) : "—"}</td>
                    <td className="py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Source / medium ───────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">Channels (source / medium)</h2>
        <p className="muted text-xs mb-3">
          The conventional channel name. <code>google / cpc</code> is paid search and{" "}
          <code>google / organic</code> is SEO — treating both as just “google” hides the
          distinction that matters most.
        </p>
        {sourceMedium.length === 0 ? (
          <p className="muted text-sm">No channel data in this range.</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5">
            <ShareChart rows={sourceMedium} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2">Channel</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">Customers</th>
                    <th className="py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceMedium.map((s) => (
                    <tr key={s.label} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.label}</td>
                      <td className="py-2 text-right">{s.leads.toLocaleString("en-IN")}</td>
                      <td className="py-2 text-right font-semibold">
                        {s.customers.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2 text-right">{s.value_inr ? fmtINR(s.value_inr) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Tagging coverage ──────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">Tagging coverage</h2>
        <p className="muted text-xs mb-3">
          How many leads carry each parameter. A zero means the website is not sending it —
          a fixable tagging problem, not an absence of traffic.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {coverage.perDimension.map((d) => (
            <div key={d.dimension} className="rounded border p-3">
              <div className="text-xs font-semibold text-gray-500">{d.label}</div>
              <div className="mt-1 text-xl font-bold text-gray-900">
                {pct(d.filled, coverage.totalLeads)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {d.filled.toLocaleString("en-IN")} of {coverage.totalLeads.toLocaleString("en-IN")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
