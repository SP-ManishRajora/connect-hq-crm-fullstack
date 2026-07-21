"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "HOLIDAY", "ABSENT"];

const statusColor: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700",
  LATE: "bg-amber-100 text-amber-700",
  HALF_DAY: "bg-yellow-100 text-yellow-700",
  LEAVE: "bg-sky-100 text-sky-700",
  HOLIDAY: "bg-purple-100 text-purple-700",
  ABSENT: "bg-rose-100 text-rose-700",
};

function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}
function hoursBetween(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return null;
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

// Time plus, when GPS was captured, a map link and the accuracy radius.
function TimeWithGps({ at, lat, lng, accM }: { at: string | null | undefined; lat: number | null; lng: number | null; accM: number | null }) {
  if (!at) return <>—</>;
  const time = fmtTime(at);
  if (lat == null || lng == null) return <>{time}</>;
  return (
    <div>
      <div>{time}</div>
      <a
        className="text-xs text-brand-600 hover:underline"
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
      >
        📍 map{accM != null ? ` ±${Math.round(accM)}m` : ""}
      </a>
    </div>
  );
}

export default function StaffAttendanceClient({ users, records, centers, selectedDate, selectedCenterId }: any) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);

  const recordsByUser = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of records) m[r.userId] = r;
    return m;
  }, [records]);

  function changeFilters(next: { date?: string; centerId?: string }) {
    const params = new URLSearchParams();
    const date = next.date ?? selectedDate;
    const centerId = next.centerId ?? selectedCenterId;
    if (date) params.set("date", date);
    if (centerId) params.set("centerId", centerId);
    router.push(`/staff-attendance?${params.toString()}`);
  }

  async function setStatus(userId: string, status: string) {
    setSavingId(userId);
    try {
      const r = await fetch("/api/staff-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date: selectedDate, status }),
      });
      if (r.ok) router.refresh();
      else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
    } finally {
      setSavingId(null);
    }
  }

  const summary = useMemo(() => {
    const counts: Record<string, number> = { PRESENT: 0, LATE: 0, HALF_DAY: 0, LEAVE: 0, HOLIDAY: 0, ABSENT: 0, NOT_MARKED: 0 };
    for (const u of users) {
      const r = recordsByUser[u.id];
      if (!r) counts.NOT_MARKED++;
      else counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [users, recordsByUser]);

  return (
    <div className="space-y-4">
      <h1 className="h1">Staff Attendance</h1>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Date</label>
          <input aria-label="Filter date" type="date" className="input" value={selectedDate} onChange={(e) => changeFilters({ date: e.target.value })} />
        </div>
        <div>
          <label className="label">Center</label>
          <select aria-label="Center filter" className="input" value={selectedCenterId} onChange={(e) => changeFilters({ centerId: e.target.value })}>
            <option value="">All centers</option>
            {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="text-sm flex flex-wrap gap-2 ml-auto">
          {Object.entries(summary).map(([k, v]) => (
            <span key={k} className={`badge ${statusColor[k] || "bg-gray-100 text-gray-700"}`}>{k.replace("_", " ")}: {v as number}</span>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Center</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th></tr>
          </thead>
          <tbody>
            {users.map((u: any) => {
              const r = recordsByUser[u.id];
              const hrs = hoursBetween(r?.checkInAt, r?.checkOutAt);
              const currentStatus = r?.status || "NOT_MARKED";
              return (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}<div className="text-xs text-gray-500">{u.email}</div></td>
                  <td className="text-xs">{u.role}</td>
                  <td>{u.center?.name || "—"}</td>
                  <td><TimeWithGps at={r?.checkInAt} lat={r?.checkInLat ?? null} lng={r?.checkInLng ?? null} accM={r?.checkInAccM ?? null} /></td>
                  <td><TimeWithGps at={r?.checkOutAt} lat={r?.checkOutLat ?? null} lng={r?.checkOutLng ?? null} accM={r?.checkOutAccM ?? null} /></td>
                  <td>{hrs !== null ? hrs.toFixed(2) : "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${statusColor[currentStatus] || "bg-gray-100 text-gray-700"}`}>{currentStatus.replace("_", " ")}</span>
                      <select
                        aria-label={`Set status for ${u.name}`}
                        className="input text-xs py-1 max-w-[140px]"
                        value={r?.status || ""}
                        disabled={savingId === u.id}
                        onChange={(e) => setStatus(u.id, e.target.value)}
                      >
                        <option value="" disabled>Set…</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-400 py-8">No staff users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
