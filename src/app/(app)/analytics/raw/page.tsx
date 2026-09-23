import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { fmtDateTime } from "@/lib/utils";
import {
  rangeFromDays,
  getRecentEvents,
  getFieldCoverage,
  getEventNameCounts,
} from "@/lib/analytics/report";
import { EVENT_NAMES } from "@/lib/analytics/events";

export const dynamic = "force-dynamic";

/*
 * Raw event inspector.
 *
 * The sibling dashboard answers "how is the site doing". This page answers
 * "is the tracker sending what we think it is" — a different job, and one the
 * aggregate view actively obscures: a field the website never populates and a
 * campaign with genuinely no traffic both render as a zero there.
 *
 * So this shows rows, not totals, and leads with a coverage table naming which
 * fields arrive empty. It is a debugging tool for whoever is wiring up
 * chq-track.js, not a report for anyone else, which is why it sits off the
 * sidebar behind a link from the dashboard.
 *
 * Deliberately admin-only, a tier above the dashboard's own permission: the
 * columns here include visitor and session ids and the truncated IP prefix,
 * which the aggregates exist precisely to avoid showing.
 */

const LIMITS = [50, 100, 250];

/** Long opaque values (gclid, ids) get clipped — full value on hover. */
function Cell({ value, clip = 0 }: { value: string | null; clip?: number }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const short = clip > 0 && value.length > clip ? value.slice(0, clip) + "…" : value;
  return (
    <span title={value} className="font-mono text-[11px]">
      {short}
    </span>
  );
}

export default async function RawEventsPage({
  searchParams,
}: {
  searchParams: { days?: string; limit?: string; name?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  // A tier stricter than /analytics: these rows carry visitor ids and an IP
  // prefix, which the aggregate dashboard exists to keep out of view.
  if (me.role !== "ADMIN" && me.role !== "OWNER") {
    return <div className="card">Raw event inspection is limited to Admin and Owner.</div>;
  }
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }

  const range = rangeFromDays(Number(searchParams?.days ?? 7));
  const limit = Math.min(Math.max(Number(searchParams?.limit ?? 100) || 100, 1), 500);

  // Ignore an unknown ?name= rather than returning an empty table that looks
  // like "no events" when it really means "no such event type".
  const nameFilter =
    searchParams?.name && (EVENT_NAMES as readonly string[]).includes(searchParams.name)
      ? searchParams.name
      : undefined;

  const [events, coverage, nameCounts] = await Promise.all([
    getRecentEvents(limit, nameFilter),
    getFieldCoverage(range),
    getEventNameCounts(range),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    p.set("days", String(over.days ?? range.days));
    p.set("limit", String(over.limit ?? limit));
    const n = "name" in over ? over.name : nameFilter;
    if (n) p.set("name", n);
    return `/analytics/raw?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Raw tracking events</h1>
          <p className="muted">
            Every field as stored, newest first. Use this to confirm what the website is
            actually sending — not to read traffic numbers.
          </p>
        </div>
        <Link href="/analytics" className="btn-ghost text-sm">
          ← Back to dashboard
        </Link>
      </div>

      {/* Coverage first: it is the answer to "why is that column empty". */}
      <div className="card">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="h2">Field coverage</h2>
          <span className="muted text-xs">
            Of {coverage.total.toLocaleString("en-IN")} events received in the last {range.days} days
          </span>
        </div>

        {coverage.total === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-3 mt-3">
            No events at all in this window. Either the tracker is not live on the website,
            or it cannot reach this server. Check that <code>chq-track.js</code> is loaded and
            that <code>/api/track</code> is still listed in <code>PUBLIC_PATHS</code>.
          </p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-semibold">Field</th>
                  <th className="py-2 pr-3 font-semibold">Filled</th>
                  <th className="py-2 pr-3 font-semibold">Share</th>
                  <th className="py-2 font-semibold">What it is</th>
                </tr>
              </thead>
              <tbody>
                {coverage.fields.map((f) => {
                  const share = coverage.total ? (f.filled / coverage.total) * 100 : 0;
                  const empty = f.filled === 0;
                  return (
                    <tr key={f.field} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{f.field}</td>
                      <td className="py-2 pr-3 tabular-nums">{f.filled.toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            empty
                              ? "text-red-700 font-semibold"
                              : share < 50
                              ? "text-amber-700"
                              : "text-green-700"
                          }
                        >
                          {empty ? "never sent" : `${share.toFixed(0)}%`}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-gray-500">{f.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted text-xs mt-3">
              “never sent” means the website never populated that field — a frontend fix,
              not an absence of traffic. A partial share is normal for campaign fields:
              direct and organic visits legitimately carry none.
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 mr-1">Window</span>
          {[1, 7, 30].map((d) => (
            <Link
              key={d}
              href={qs({ days: String(d) })}
              className={d === range.days ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              {d === 1 ? "24h" : `${d}d`}
            </Link>
          ))}

          <span className="text-xs font-semibold text-gray-500 ml-4 mr-1">Rows</span>
          {LIMITS.map((l) => (
            <Link
              key={l}
              href={qs({ limit: String(l) })}
              className={l === limit ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              {l}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
          <span className="text-xs font-semibold text-gray-500 mr-1">Event</span>
          <Link href={qs({ name: undefined })} className={!nameFilter ? "btn-primary text-xs" : "btn-ghost text-xs"}>
            All
          </Link>
          {nameCounts.map((n) => (
            <Link
              key={n.label}
              href={qs({ name: n.label })}
              className={n.label === nameFilter ? "btn-primary text-xs" : "btn-ghost text-xs"}
            >
              {n.label} <span className="opacity-60">{n.n}</span>
            </Link>
          ))}
          {nameCounts.length === 0 && <span className="muted text-xs">No events in this window.</span>}
        </div>
      </div>

      {/* The rows themselves. */}
      <div className="card">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="h2">Latest events</h2>
          <span className="muted text-xs">
            {events.length} shown · ordered by arrival, so replayed beacons still appear here
          </span>
        </div>

        {events.length === 0 ? (
          <p className="muted text-sm mt-3">Nothing to show.</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-semibold">Arrived</th>
                  <th className="py-2 pr-3 font-semibold">Occurred</th>
                  <th className="py-2 pr-3 font-semibold">Event</th>
                  <th className="py-2 pr-3 font-semibold">Path</th>
                  <th className="py-2 pr-3 font-semibold">Source</th>
                  <th className="py-2 pr-3 font-semibold">Medium</th>
                  <th className="py-2 pr-3 font-semibold">Campaign</th>
                  <th className="py-2 pr-3 font-semibold">Term</th>
                  <th className="py-2 pr-3 font-semibold">Content</th>
                  <th className="py-2 pr-3 font-semibold">gclid</th>
                  <th className="py-2 pr-3 font-semibold">Lead ref</th>
                  <th className="py-2 pr-3 font-semibold">Device</th>
                  <th className="py-2 pr-3 font-semibold">Visitor</th>
                  <th className="py-2 pr-3 font-semibold">Session</th>
                  <th className="py-2 font-semibold">meta</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  // A visible gap between the two means beacons are queuing —
                  // worth seeing rather than silently normalising.
                  const lagMs = e.createdAt.getTime() - e.occurredAt.getTime();
                  const lagged = lagMs > 60 * 1000;
                  return (
                    <tr key={e.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3">{fmtDateTime(e.createdAt)}</td>
                      <td className={`py-2 pr-3 ${lagged ? "text-amber-700" : ""}`}>
                        {fmtDateTime(e.occurredAt)}
                        {lagged && (
                          <span className="ml-1" title="Arrived later than it happened — a queued or replayed beacon">
                            ⏱
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono">{e.name}</td>
                      <td className="py-2 pr-3" title={e.url ?? e.path}>
                        <Cell value={e.path} clip={36} />
                      </td>
                      <td className="py-2 pr-3"><Cell value={e.utmSource} /></td>
                      <td className="py-2 pr-3"><Cell value={e.utmMedium} /></td>
                      <td className="py-2 pr-3"><Cell value={e.utmCampaign} clip={24} /></td>
                      <td className="py-2 pr-3"><Cell value={e.utmTerm} clip={24} /></td>
                      <td className="py-2 pr-3"><Cell value={e.utmContent} clip={24} /></td>
                      <td className="py-2 pr-3"><Cell value={e.gclid} clip={12} /></td>
                      <td className="py-2 pr-3"><Cell value={e.websiteLeadId} clip={20} /></td>
                      <td className="py-2 pr-3">
                        <Cell value={[e.device, e.browser, e.os].filter(Boolean).join(" · ") || null} />
                      </td>
                      <td className="py-2 pr-3"><Cell value={e.visitorId} clip={8} /></td>
                      <td className="py-2 pr-3"><Cell value={e.sessionId} clip={8} /></td>
                      <td className="py-2"><Cell value={e.meta} clip={40} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted text-xs mt-3">
              Truncated values show in full on hover. IP addresses are not stored — only a
              /24 prefix, and it is not shown here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
