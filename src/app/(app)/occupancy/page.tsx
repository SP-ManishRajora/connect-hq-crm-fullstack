import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getOccupancyKpis } from "@/lib/occupancy/dashboard";
import { fmtINR, fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  AVAILABLE:   { label: "Available",   cls: "bg-emerald-100 text-emerald-700" },
  OCCUPIED:    { label: "Occupied",    cls: "bg-rose-100 text-rose-700" },
  RESERVED:    { label: "Reserved",    cls: "bg-amber-100 text-amber-700" },
  MAINTENANCE: { label: "Maintenance", cls: "bg-gray-200 text-gray-700" },
  BLOCKED:     { label: "Blocked",     cls: "bg-gray-800 text-white" },
};

const TYPE_LABEL: Record<string, string> = {
  DEDICATED_SEAT: "Dedicated Seats", HOT_DESK: "Hot Desks", CABIN: "Cabins",
  MEETING_ROOM: "Meeting Rooms", PRIVATE_OFFICE: "Private Offices", VIRTUAL_OFFICE: "Virtual Offices",
};

export default async function OccupancyDashboard() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "occupancy")) {
    return <div className="card">You don’t have access to the Occupancy module.</div>;
  }

  const k = await getOccupancyKpis(null);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Occupancy Dashboard</h1>
          <p className="muted">Live view across all centers.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/occupancy/map" className="btn-ghost text-sm">🗺️ Map</Link>
          <Link href="/occupancy/spaces" className="btn-ghost text-sm">🪑 Spaces</Link>
          <Link href="/occupancy/reports" className="btn-ghost text-sm">📊 Reports</Link>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Spaces" value={k.total} />
        <Kpi label="Occupied" value={k.occupied} cls="text-rose-600" />
        <Kpi label="Available" value={k.available} cls="text-emerald-600" />
        <Kpi label="Reserved" value={k.reserved} cls="text-amber-600" />
        <Kpi label="Occupancy %" value={`${k.occupancyPct}%`} />
        <Kpi label="Vacancy %" value={`${k.vacancyPct}%`} />
        <Kpi label="Monthly Revenue" value={fmtINR(k.monthlyRevenue)} />
        <Kpi label="Revenue / Seat" value={fmtINR(k.revenuePerSeat)} />
      </div>

      {k.overdueClients > 0 && (
        <div className="card border-l-4 border-rose-400 bg-rose-50">
          <span className="text-rose-700 text-sm">⚠ {k.overdueClients} client(s) with overdue invoices.</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h2 className="h2">By status</h2>
          <div className="flex flex-wrap gap-2">
            {Object.keys(STATUS_META).map((s) => (
              <span key={s} className={`badge ${STATUS_META[s].cls}`}>{STATUS_META[s].label}: {k.byStatus[s] ?? 0}</span>
            ))}
          </div>
        </div>
        <div className="card space-y-2">
          <h2 className="h2">By type</h2>
          <div className="space-y-1 text-sm">
            {Object.keys(k.byType).length === 0 && <p className="muted">No spaces yet.</p>}
            {Object.entries(k.byType).map(([t, n]) => (
              <div key={t} className="flex justify-between"><span>{TYPE_LABEL[t] || t}</span><span className="font-medium">{n}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Upcoming vacancies */}
        <div className="card">
          <h2 className="h2 mb-2">Upcoming vacancies (30 days)</h2>
          {k.upcomingVacancies.length === 0 ? (
            <p className="muted text-sm">None.</p>
          ) : (
            <table className="table text-sm">
              <thead><tr><th>Space</th><th>Client</th><th>Ends</th></tr></thead>
              <tbody>
                {k.upcomingVacancies.map((v) => (
                  <tr key={v.allocationId}>
                    <td>{v.spaceCode}</td><td>{v.clientName || "—"}</td><td>{fmtDateTime(v.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Expiring agreements */}
        <div className="card">
          <h2 className="h2 mb-2">Expiring agreements (30 days)</h2>
          {k.expiringAgreements.length === 0 ? (
            <p className="muted text-sm">None.</p>
          ) : (
            <table className="table text-sm">
              <thead><tr><th>Client</th><th>Ends</th></tr></thead>
              <tbody>
                {k.expiringAgreements.map((e) => (
                  <tr key={e.contractId}><td>{e.clientName}</td><td>{fmtDateTime(e.endDate)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, cls = "" }: { label: string; value: string | number; cls?: string }) {
  return (
    <div className="card">
      <div className="muted text-xs">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
