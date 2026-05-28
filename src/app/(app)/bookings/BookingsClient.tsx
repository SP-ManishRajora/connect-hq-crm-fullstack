"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR } from "@/lib/utils";

const EMPTY_ROOM = { centerId: "", name: "", capacity: "", hourlyRate: "" };

export default function BookingsClient({ bookings, rooms, centers, quota }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [b, setB] = useState<any>({ roomId: "", startTime: "", endTime: "", notes: "" });
  const [room, setRoom] = useState<any>(EMPTY_ROOM);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    if (r.ok) { setShow(false); router.refresh(); } else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  async function submitRoom(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/meeting-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(room) });
    if (r.ok) { setShowAddRoom(false); setRoom(EMPTY_ROOM); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Meeting Room Bookings</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setShowAddRoom(!showAddRoom)}>+ Add Room</button>
          <button type="button" className="btn-primary" onClick={() => setShow(!show)}>+ Book Room</button>
        </div>
      </div>

      {showAddRoom && (
        <form onSubmit={submitRoom} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">Add Meeting Room</h2>
          <div><label className="label">Center *</label>
            <select className="input" required value={room.centerId} onChange={(e) => setRoom({ ...room, centerId: e.target.value })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Room name *</label>
            <input className="input" required value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} placeholder="e.g. Boardroom A" />
          </div>
          <div><label className="label">Capacity *</label>
            <input className="input" type="number" min={1} required value={room.capacity} onChange={(e) => setRoom({ ...room, capacity: e.target.value })} placeholder="e.g. 8" />
          </div>
          <div><label className="label">Hourly rate (₹)</label>
            <input className="input" type="number" min={0} value={room.hourlyRate} onChange={(e) => setRoom({ ...room, hourlyRate: e.target.value })} placeholder="0 = free / within quota" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setShowAddRoom(false); setRoom(EMPTY_ROOM); }}>Cancel</button>
            <button type="submit" className="btn-primary">Save Room</button>
          </div>
        </form>
      )}

      {quota && (
        <div className="card">
          <h2 className="h2">Your meeting room quota this month</h2>
          <p className="muted text-xs">2 hours per seat per month. Overage charged at room hourly rate.</p>
          <div className="mt-2 text-sm">
            <strong>{quota.usedHrs.toFixed(1)} hrs</strong> used of <strong>{quota.totalHrs} hrs</strong> · <strong>{Math.max(0, quota.totalHrs - quota.usedHrs).toFixed(1)} hrs</strong> remaining
            <div className="bg-gray-100 h-2 mt-2 rounded">
              <div className={`h-2 rounded ${quota.usedHrs > quota.totalHrs ? "bg-rose-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (quota.usedHrs / Math.max(1, quota.totalHrs)) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">Room *</label>
            <select className="input" required value={b.roomId} onChange={(e) => setB({ ...b, roomId: e.target.value })}>
              <option value="">— Select —</option>
              {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.center.name} — {r.name} (cap {r.capacity}, {fmtINR(r.hourlyRate)}/hr)</option>)}
            </select>
          </div>
          <div><label className="label">Start *</label><input className="input" type="datetime-local" required value={b.startTime} onChange={(e) => setB({ ...b, startTime: e.target.value })} /></div>
          <div><label className="label">End *</label><input className="input" type="datetime-local" required value={b.endTime} onChange={(e) => setB({ ...b, endTime: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Confirm Booking</button></div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Room</th><th>Center</th><th>Booked By</th><th>Start</th><th>End</th><th>Hrs</th><th>Charge</th><th>Status</th></tr></thead>
          <tbody>
            {bookings.map((x: any) => (
              <tr key={x.id}>
                <td className="font-medium">{x.room.name}</td>
                <td>{x.center.name}</td>
                <td>{x.client?.companyName || x.bookedBy?.name}</td>
                <td>{new Date(x.startTime).toLocaleString()}</td>
                <td>{new Date(x.endTime).toLocaleString()}</td>
                <td>{x.durationHrs?.toFixed(1)}</td>
                <td>{x.isChargeable ? fmtINR(x.chargedAmount) : "Within quota"}</td>
                <td>{x.status}</td>
              </tr>
            ))}
            {bookings.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No bookings</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
