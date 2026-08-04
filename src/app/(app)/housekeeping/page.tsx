import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getManagementStats } from "@/lib/housekeeping/dashboard";
import { centerScope } from "@/lib/housekeeping/route-helpers";

export const dynamic = "force-dynamic";

const SEV: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};

function scoreColour(n: number | null) {
  if (n == null) return "text-gray-400";
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-amber-600";
  return "text-rose-600";
}

export default async function HousekeepingDashboard() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const mods = parseAllowedModules(me.allowedModules);
  if (!canAccess(me.role, "housekeeping", mods)) redirect("/dashboard");

  const stats = await getManagementStats(centerScope(me));
  const t = stats.totals;
  const maxTrend = Math.max(1, ...stats.trend.map((d) => Math.max(d.inspections, d.issuesRaised)));

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">🧹 Housekeeping Dashboard</h1>
      <p className="text-sm text-gray-500 mb-5">
        Facility-wide cleanliness, compliance and alerts across {t.centres} centre
        {t.centres === 1 ? "" : "s"}.
      </p>

      {/* ---- headline tiles ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Tile
          label="Facility score"
          value={stats.facilityScore != null ? String(stats.facilityScore) : "—"}
          cls={scoreColour(stats.facilityScore)}
          hint="Compliance less open criticals, overdue work and generator discrepancies"
        />
        <Tile
          label="Inspected today"
          value={String(t.inspectionsToday)}
          hint={`across ${t.areas} area${t.areas === 1 ? "" : "s"}`}
        />
        <Tile
          label="Open critical issues"
          value={String(t.criticalIssues)}
          cls={t.criticalIssues > 0 ? "text-rose-600" : "text-emerald-600"}
        />
        <Tile
          label="Generator discrepancies"
          value={String(t.genDiscrepancies)}
          cls={t.genDiscrepancies > 0 ? "text-rose-600" : "text-emerald-600"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="Open issues" value={String(t.openIssues)} small />
        <Tile label="Overdue" value={String(t.overdueIssues)} cls={t.overdueIssues > 0 ? "text-amber-600" : ""} small />
        <Tile label="Unread alerts" value={String(t.openAlerts)} cls={t.openAlerts > 0 ? "text-amber-600" : ""} small />
        <Tile
          label="Avg resolution"
          value={stats.avgResolutionHours != null ? `${stats.avgResolutionHours} h` : "—"}
          small
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* ---- centre comparison ---- */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-medium text-sm mb-3">Centres</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="pb-2">Centre</th>
                  <th className="pb-2 text-right">Today</th>
                  <th className="pb-2 text-right">Open</th>
                  <th className="pb-2 text-right">Gen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.centres.map((c) => (
                  <tr key={c.centerId}>
                    <td className="py-2">
                      <Link href={`/housekeeping/centre/${c.centerId}`}
                        className="font-medium text-brand-600 hover:underline">
                        {c.centre}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {c.areas} areas
                        {c.generatorsRunning > 0 && (
                          <span className="ml-1 text-emerald-600">· {c.generatorsRunning} running</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <span className={c.compliancePct >= 80 ? "text-emerald-600" : c.compliancePct >= 40 ? "text-amber-600" : "text-rose-600"}>
                        {c.compliancePct}%
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {c.openIssues}
                      {c.criticalIssues > 0 && <span className="text-rose-600"> ({c.criticalIssues}!)</span>}
                    </td>
                    <td className="py-2 text-right">
                      {c.genDiscrepancies > 0
                        ? <span className="text-rose-600">{c.genDiscrepancies}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                  </tr>
                ))}
                {stats.centres.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-gray-500">No centres.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- live alerts ---- */}
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">Recent alerts</h2>
            <Link href="/housekeeping/alerts" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${SEV[a.severity] ?? SEV.MEDIUM}`}>
                  {a.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{a.title}</div>
                  <div className="text-xs text-gray-500">
                    {a.centre} · {new Date(a.createdAt).toLocaleString()}
                    {a.status !== "NEW" && ` · ${a.status.toLowerCase()}`}
                  </div>
                </div>
              </div>
            ))}
            {stats.recentAlerts.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">No alerts. 🎉</div>
            )}
          </div>
        </section>

        {/* ---- 14-day trend ---- */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-medium text-sm mb-3">Last 14 days</h2>
          <div className="flex items-end gap-1 h-28">
            {stats.trend.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col justify-end gap-0.5" title={`${d.date}: ${d.inspections} inspections, ${d.issuesRaised} issues raised, ${d.issuesClosed} closed`}>
                <div className="bg-brand-500 rounded-sm" style={{ height: `${(d.inspections / maxTrend) * 70}px` }} />
                <div className="bg-rose-400 rounded-sm" style={{ height: `${(d.issuesRaised / maxTrend) * 30}px` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{stats.trend[0]?.date}</span>
            <span>{stats.trend[stats.trend.length - 1]?.date}</span>
          </div>
          <div className="flex gap-3 text-xs text-gray-500 mt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-500" /> inspections</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-400" /> issues raised</span>
          </div>
        </section>

        {/* ---- staff ranking ---- */}
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">Staff efficiency (30 days)</h2>
            <Link href="/housekeeping/reports?type=staff-efficiency" className="text-xs text-brand-600 hover:underline">
              Full report
            </Link>
          </div>
          <div className="space-y-2">
            {stats.topStaff.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-xs text-gray-500">{s.closed} closed</span>
                <span className={`font-medium ${scoreColour(s.score)}`}>{s.score}</span>
              </div>
            ))}
            {stats.topStaff.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">
                No corrective-action activity in the last 30 days.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link href="/housekeeping/issues" className="rounded-md border px-3 py-2 hover:bg-gray-50">Issues</Link>
        <Link href="/housekeeping/generator" className="rounded-md border px-3 py-2 hover:bg-gray-50">Generators</Link>
        <Link href="/housekeeping/reports" className="rounded-md border px-3 py-2 hover:bg-gray-50">Reports</Link>
        <Link href="/housekeeping/inspect" className="rounded-md border px-3 py-2 hover:bg-gray-50">Start an inspection</Link>
      </div>
    </div>
  );
}

function Tile({
  label, value, cls = "", hint, small = false,
}: {
  label: string; value: string; cls?: string; hint?: string; small?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`${small ? "text-xl" : "text-3xl"} font-semibold mt-1 ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-1 leading-tight">{hint}</div>}
    </div>
  );
}
