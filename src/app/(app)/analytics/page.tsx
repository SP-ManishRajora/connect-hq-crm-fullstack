import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { fmtDateTime } from "@/lib/utils";
import {
  rangeFromDays,
  getTotals,
  getDaily,
  getCampaigns,
  getTopPages,
  getDeviceSplit,
  getTopReferrers,
  getLastEventAt,
} from "@/lib/analytics/report";

export const dynamic = "force-dynamic";

/*
 * Website analytics.
 *
 * Reads the WebEvent rows that connecthq.co.in posts to /api/track, alongside
 * the Lead table. The two are deliberately shown side by side: traffic numbers
 * come from the visitor's browser and are lost to ad-blockers, while leads are
 * rows we actually hold. Where a number matters commercially — "did this
 * campaign produce business" — the lead count is the one to trust, and the page
 * says so rather than presenting both as equally solid.
 */

const RANGES = [7, 30, 90];

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

/** Inline bar, sized as a share of the largest row. Avoids a chart dependency. */
function Bar({ value, max, className = "bg-brand-500" }: { value: number; max: number; className?: string }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
      <div className={`h-full rounded ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }

  const range = rangeFromDays(Number(searchParams?.days ?? 30));

  const [totals, daily, campaigns, pages, devices, referrers, lastEvent] = await Promise.all([
    getTotals(range),
    getDaily(range),
    getCampaigns(range),
    getTopPages(range),
    getDeviceSplit(range),
    getTopReferrers(range),
    getLastEventAt(),
  ]);

  const contactAttempts = totals.phoneClicks + totals.whatsappClicks + totals.leadSubmits;
  const maxDay = Math.max(1, ...daily.map((d) => d.pageViews));
  const maxPage = Math.max(1, ...pages.map((p) => p.views));
  const deviceTotal = devices.reduce((s, d) => s + d.n, 0);

  // A tracker that stopped reporting renders as a confident set of zeroes, so
  // say plainly when the last event arrived.
  const stale = !lastEvent || Date.now() - lastEvent.getTime() > 24 * 60 * 60 * 1000;

  const stats = [
    { label: "Page views", value: totals.pageViews, hint: "Tracked visits" },
    { label: "Sessions", value: totals.sessions, hint: "Distinct visits" },
    { label: "Visitors", value: totals.visitors, hint: "Distinct browsers" },
    { label: "Contact attempts", value: contactAttempts, hint: "Calls, WhatsApp, forms" },
    { label: "Leads in CRM", value: totals.leads, hint: "Rows actually stored" },
    { label: "From Google Ads", value: totals.paidLeads, hint: "Leads with a gclid" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Website Analytics</h1>
          <p className="muted">
            Traffic and campaign performance for connecthq.co.in, last {range.days} days.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/analytics?days=${d}`}
              className={d === range.days ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {d}d
            </Link>
          ))}
          {/* Off the sidebar on purpose: a debugging view for whoever is wiring
              up the tracker, reachable from the report it explains. */}
          {(me.role === "ADMIN" || me.role === "OWNER") && (
            <Link href="/analytics/raw" className="btn-ghost text-sm ml-2" title="Inspect raw events — what the website is actually sending">
              Raw events
            </Link>
          )}
        </div>
      </div>

      {stale && (
        <div className="card border-amber-300 bg-amber-50">
          <div className="font-semibold text-amber-900">No recent tracking data</div>
          <p className="text-sm text-amber-800 mt-1">
            {lastEvent
              ? `The last event arrived ${fmtDateTime(lastEvent)}. `
              : "No events have ever been received. "}
            The numbers below are not a report of quiet traffic — they are what we have.
            Check that the tracking snippet is live on the website and that it can reach
            this server.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-xs font-semibold text-gray-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{s.value.toLocaleString("en-IN")}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="h2">Daily traffic</h2>
          <span className="muted text-xs">Bar height = page views · number = contact attempts</span>
        </div>
        {/* A plain flex row of bars rather than a charting library: this is one
            series over a short range, and a dependency would not earn itself. */}
        <div className="mt-4 flex items-end gap-[2px] h-32">
          {daily.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col justify-end items-center group relative">
              <div
                className="w-full bg-brand-500 rounded-t min-h-[2px] group-hover:bg-brand-600"
                style={{ height: `${(d.pageViews / maxDay) * 100}%` }}
              />
              {/* Native title, so the chart needs no client-side JS. */}
              <span className="sr-only">{`${d.day}: ${d.pageViews} views, ${d.conversions} contacts`}</span>
              <div
                className="absolute -top-1 text-[10px] text-gray-500"
                title={`${d.day}: ${d.pageViews} views, ${d.conversions} contact attempts`}
              >
                {d.conversions > 0 ? d.conversions : ""}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{daily[0]?.day}</span>
          <span>{daily[daily.length - 1]?.day}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="h2 mb-1">Campaigns</h2>
        <p className="muted text-xs mb-3">
          Sessions are what the browser reported and are undercounted by ad-blockers.
          <strong> Leads</strong> is the number of rows in the CRM — that is the one to judge spend on.
        </p>
        {campaigns.length === 0 ? (
          <p className="muted text-sm">No campaign traffic in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Campaign</th>
                  <th className="py-2">Source</th>
                  <th className="py-2 text-right">Sessions</th>
                  <th className="py-2 text-right">Contact attempts</th>
                  <th className="py-2 text-right">Leads</th>
                  <th className="py-2 text-right">Lead rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaign} className="border-b last:border-0">
                    <td className="py-2 font-medium break-all">{c.campaign}</td>
                    <td className="py-2 text-gray-500">{c.source}</td>
                    <td className="py-2 text-right">{c.sessions.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">{c.conversions.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right font-semibold">{c.leads.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right text-gray-500">{pct(c.leads, c.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="h2 mb-3">Top pages</h2>
          {pages.length === 0 ? (
            <p className="muted text-sm">Nothing tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {pages.map((p) => (
                <div key={p.path}>
                  <div className="flex justify-between text-sm gap-3">
                    <span className="truncate font-medium" title={p.path}>{p.path}</span>
                    <span className="text-gray-500 whitespace-nowrap">
                      {p.views.toLocaleString("en-IN")}
                      {p.conversions > 0 && (
                        <span className="text-emerald-600"> · {p.conversions} contacts</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1"><Bar value={p.views} max={maxPage} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="h2 mb-3">Devices</h2>
            {deviceTotal === 0 ? (
              <p className="muted text-sm">Nothing tracked yet.</p>
            ) : (
              <div className="space-y-3">
                {devices.map((d) => (
                  <div key={d.label}>
                    <div className="flex justify-between text-sm">
                      <span className="capitalize font-medium">{d.label}</span>
                      <span className="text-gray-500">
                        {d.n.toLocaleString("en-IN")} · {pct(d.n, deviceTotal)}
                      </span>
                    </div>
                    <div className="mt-1"><Bar value={d.n} max={deviceTotal} className="bg-indigo-500" /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="h2 mb-3">Referrers</h2>
            {referrers.length === 0 ? (
              <p className="muted text-sm">No referrer data in this range.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {referrers.map((rf) => (
                  <li key={rf.label} className="flex justify-between gap-3">
                    <span className="truncate" title={rf.label}>{rf.label}</span>
                    <span className="text-gray-500 whitespace-nowrap">{rf.n.toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="muted text-xs">
        Tracked first-party: no data leaves this server. Visitor ids are random strings
        generated by the website and carry no meaning elsewhere; IP addresses are
        truncated before storage. Counts here will not match Google Analytics exactly —
        different blocking, different session rules.
      </p>
    </div>
  );
}
