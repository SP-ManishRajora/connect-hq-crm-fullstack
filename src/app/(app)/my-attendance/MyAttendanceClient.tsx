"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MOY = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtTime(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}
function fmtDateShort(d: string) {
  const dt = new Date(d);
  return `${DOW[dt.getDay()]}, ${dt.getDate()} ${MOY[dt.getMonth()]}`;
}
function hoursBetween(a: string, b: string | null | undefined) {
  if (!b) return null;
  const diffMs = new Date(b).getTime() - new Date(a).getTime();
  return diffMs / (1000 * 60 * 60);
}

export default function MyAttendanceClient({ todayRow, history }: any) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Resolve the browser's position, or null if unavailable/denied/timed out.
  // Never rejects: attendance must still go through without a fix.
  function getCoords(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  async function call(action: "check-in" | "check-out") {
    setBusy(true);
    try {
      const coords = await getCoords();
      if (!coords) {
        const ok = confirm(
          "Location unavailable — permission may be denied, or the browser needs HTTPS.\n\n" +
          "Record this without GPS?"
        );
        if (!ok) return;
      }
      const r = await fetch("/api/my-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(coords || {}) }),
      });
      if (r.ok) {
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "Failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const checkedIn = !!todayRow?.checkInAt;
  const checkedOut = !!todayRow?.checkOutAt;
  const todayHrs = todayRow?.checkInAt && todayRow?.checkOutAt ? hoursBetween(todayRow.checkInAt, todayRow.checkOutAt) : null;

  return (
    <div className="space-y-4">
      <h1 className="h1">My Attendance</h1>

      <div className="card space-y-3">
        <h2 className="h2">Today</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="muted text-xs">Check in</div>
            <div className="text-lg font-semibold">{fmtTime(todayRow?.checkInAt)}</div>
          </div>
          <div>
            <div className="muted text-xs">Check out</div>
            <div className="text-lg font-semibold">{fmtTime(todayRow?.checkOutAt)}</div>
          </div>
          <div>
            <div className="muted text-xs">Hours</div>
            <div className="text-lg font-semibold">{todayHrs !== null ? todayHrs.toFixed(2) : "—"}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || checkedIn}
            onClick={() => call("check-in")}
          >
            {checkedIn ? "Checked in" : "Check In"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy || !checkedIn || checkedOut}
            onClick={() => call("check-out")}
          >
            {checkedOut ? "Checked out" : "Check Out"}
          </button>
        </div>
        {todayRow?.center && <p className="muted text-xs">Center: {todayRow.center.name}</p>}
      </div>

      <div className="card">
        <h2 className="h2 mb-3">Last 30 days</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Center</th><th>Status</th></tr>
            </thead>
            <tbody>
              {history.map((row: any) => {
                const hrs = row.checkInAt && row.checkOutAt ? hoursBetween(row.checkInAt, row.checkOutAt) : null;
                return (
                  <tr key={row.id}>
                    <td className="font-medium">{fmtDateShort(row.date)}</td>
                    <td>{fmtTime(row.checkInAt)}</td>
                    <td>{fmtTime(row.checkOutAt)}</td>
                    <td>{hrs !== null ? hrs.toFixed(2) : "—"}</td>
                    <td>{row.center?.name || "—"}</td>
                    <td><span className="badge bg-gray-100 text-gray-700">{row.status}</span></td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8">No attendance records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
