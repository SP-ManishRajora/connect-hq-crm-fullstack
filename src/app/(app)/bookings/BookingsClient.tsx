"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDateTime } from "@/lib/utils";

const EMPTY_ROOM = { centerId: "", name: "", capacity: "", hourlyRate: "", amenities: "" };

// Calendar window: 8am–8pm.
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const HOUR_PX = 48; // vertical pixels per hour
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Deterministic room color (stable across server/client — index-based, no randomness).
const ROOM_COLORS = [
  "bg-brand-600", "bg-emerald-600", "bg-amber-600", "bg-sky-600",
  "bg-violet-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600",
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// Format a Date as a value for <input type="datetime-local"> in LOCAL time.
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookingsClient({ bookings, rooms, centers, clients = [], quota, me, canBookOnBehalf }: any) {
  const router = useRouter();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [show, setShow] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [b, setB] = useState<any>({ roomId: "", startTime: "", endTime: "", notes: "", clientId: "" });
  const [room, setRoom] = useState<any>(EMPTY_ROOM);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [centerFilter, setCenterFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  // Week anchor. Initialised on the client only (avoids server/client "today" mismatch).
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  useEffect(() => { setWeekStart(startOfWeek(new Date())); }, []);

  const canAddRoom = me && ["ADMIN", "OWNER", "CENTER_MANAGER"].includes(me.role);

  const isStaff = Boolean(canBookOnBehalf);

  const roomsInScope = useMemo(
    () => rooms.filter((r: any) => (centerFilter ? r.centerId === centerFilter : true)),
    [rooms, centerFilter],
  );

  const visibleBookings = useMemo(
    () =>
      bookings.filter((x: any) => {
        if (x.status !== "CONFIRMED") return false;
        if (centerFilter && x.centerId !== centerFilter) return false;
        if (roomFilter && x.roomId !== roomFilter) return false;
        return true;
      }),
    [bookings, centerFilter, roomFilter],
  );

  function roomColor(roomId: string) {
    const idx = rooms.findIndex((r: any) => r.id === roomId);
    return ROOM_COLORS[(idx < 0 ? 0 : idx) % ROOM_COLORS.length];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload: any = { roomId: b.roomId, startTime: b.startTime, endTime: b.endTime, notes: b.notes };
    if (isStaff && b.clientId) payload.clientId = b.clientId;
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { setShow(false); setB({ roomId: "", startTime: "", endTime: "", notes: "", clientId: "" }); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); setErr(j.error || "Failed"); }
  }

  async function submitRoom(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/meeting-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(room) });
    if (r.ok) { setShowAddRoom(false); setRoom(EMPTY_ROOM); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  async function cancelBooking(id: string) {
    if (!confirm("Cancel this booking?")) return;
    const r = await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    if (r.ok) router.refresh();
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Could not cancel"); }
  }

  // Open the booking form prefilled from a clicked calendar slot (1-hour default).
  function openSlot(day: Date, hour: number) {
    const start = new Date(day); start.setHours(hour, 0, 0, 0);
    const end = new Date(start); end.setHours(hour + 1, 0, 0, 0);
    setErr(null);
    setB((prev: any) => ({
      ...prev,
      roomId: roomFilter || prev.roomId || (roomsInScope[0]?.id ?? ""),
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
    }));
    setShow(true);
  }

  const weekDays = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const now = weekStart ? new Date() : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Meeting Room Schedule</h1>
        <div className="flex gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            <button type="button" className={`px-3 py-1.5 text-sm ${view === "calendar" ? "bg-brand-600 text-white" : "bg-white"}`} onClick={() => setView("calendar")}>Calendar</button>
            <button type="button" className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-brand-600 text-white" : "bg-white"}`} onClick={() => setView("list")}>List</button>
          </div>
          {canAddRoom && <button type="button" className="btn-ghost" onClick={() => setShowAddRoom(!showAddRoom)}>+ Add Room</button>}
          <button type="button" className="btn-primary" onClick={() => { setErr(null); setShow(!show); }}>+ Book Room</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Center</label>
          <select className="input" value={centerFilter} onChange={(e) => { setCenterFilter(e.target.value); setRoomFilter(""); }}>
            <option value="">All centers</option>
            {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Room</label>
          <select className="input" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
            <option value="">All rooms</option>
            {roomsInScope.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {view === "calendar" && weekStart && (
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
            <button type="button" className="btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <button type="button" className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
            <span className="text-sm muted">{weekDays[0]?.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {weekDays[6]?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        )}
      </div>

      {showAddRoom && canAddRoom && (
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
          <div className="sm:col-span-2"><label className="label">Amenities</label>
            <input className="input" value={room.amenities} onChange={(e) => setRoom({ ...room, amenities: e.target.value })} placeholder="Comma-separated, e.g. Projector, Whiteboard, AC" />
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
          <h2 className="h2 sm:col-span-2">Book a meeting room</h2>
          <div className="sm:col-span-2"><label className="label">Room *</label>
            <select className="input" required value={b.roomId} onChange={(e) => setB({ ...b, roomId: e.target.value })}>
              <option value="">— Select —</option>
              {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.center.name} — {r.name} (cap {r.capacity}, {fmtINR(r.hourlyRate)}/hr)</option>)}
            </select>
          </div>
          {isStaff && (
            <div className="sm:col-span-2"><label className="label">Book on behalf of client</label>
              <select className="input" value={b.clientId} onChange={(e) => setB({ ...b, clientId: e.target.value })}>
                <option value="">— None (walk-in / no client) —</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
              <p className="muted text-xs mt-1">Charges/quota apply to the selected client.</p>
            </div>
          )}
          <div><label className="label">Start *</label><input className="input" type="datetime-local" required value={b.startTime} onChange={(e) => setB({ ...b, startTime: e.target.value })} /></div>
          <div><label className="label">End *</label><input className="input" type="datetime-local" required value={b.endTime} onChange={(e) => setB({ ...b, endTime: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></div>
          {err && <p className="sm:col-span-2 text-red-600 text-sm">{err}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Confirm Booking</button></div>
        </form>
      )}

      {/* CALENDAR VIEW */}
      {view === "calendar" && (
        <div className="card overflow-x-auto">
          {!weekStart ? (
            <p className="muted text-center py-8">Loading calendar…</p>
          ) : (
            <div className="min-w-[820px]">
              {/* Day headers */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
                <div />
                {weekDays.map((d, i) => {
                  const today = now && sameDay(d, now);
                  return (
                    <div key={i} className={`text-center py-2 text-sm border-b ${today ? "font-bold text-brand-700" : ""}`}>
                      {DAYS[d.getDay()]}<br /><span className="text-xs muted">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
              {/* Time grid */}
              <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
                {/* Hour labels */}
                <div>
                  {hours.map((h) => (
                    <div key={h} className="text-[10px] muted text-right pr-1 border-r" style={{ height: HOUR_PX }}>
                      {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}
                    </div>
                  ))}
                </div>
                {/* Day columns */}
                {weekDays.map((day, di) => {
                  const dayBookings = visibleBookings.filter((x: any) => sameDay(new Date(x.startTime), day));
                  return (
                    <div key={di} className="relative border-r" style={{ height: HOUR_PX * hours.length }}>
                      {/* Hour cells (clickable to book) */}
                      {hours.map((h) => (
                        <button
                          key={h}
                          type="button"
                          title="Book this slot"
                          onClick={() => openSlot(day, h)}
                          className="block w-full border-b border-gray-100 hover:bg-brand-50/60"
                          style={{ height: HOUR_PX }}
                        />
                      ))}
                      {/* Booking blocks */}
                      {dayBookings.map((x: any) => {
                        const s = new Date(x.startTime);
                        const e = new Date(x.endTime);
                        const startH = s.getHours() + s.getMinutes() / 60;
                        const endH = e.getHours() + e.getMinutes() / 60;
                        const top = (Math.max(DAY_START_HOUR, startH) - DAY_START_HOUR) * HOUR_PX;
                        const height = Math.max(16, (Math.min(DAY_END_HOUR, endH) - Math.max(DAY_START_HOUR, startH)) * HOUR_PX);
                        const mine = me && (x.bookedById === me.id);
                        return (
                          <div
                            key={x.id}
                            className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-white text-[10px] leading-tight overflow-hidden ${roomColor(x.roomId)}`}
                            style={{ top, height }}
                            title={`${x.room?.name} · ${x.client?.companyName || x.bookedBy?.name} · ${fmtDateTime(x.startTime)}–${fmtDateTime(x.endTime)}`}
                          >
                            <div className="font-semibold truncate">{x.room?.name}</div>
                            <div className="truncate opacity-90">{x.client?.companyName || x.bookedBy?.name}</div>
                            {mine && <button type="button" onClick={(ev) => { ev.stopPropagation(); cancelBooking(x.id); }} className="underline opacity-90">cancel</button>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <p className="muted text-xs mt-2">Click an empty slot to book. Blocks are colored by room. Times shown 8am–8pm.</p>
            </div>
          )}
        </div>
      )}

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Room</th><th>Center</th><th>Booked By</th><th>Start</th><th>End</th><th>Hrs</th><th>Charge</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {visibleBookings.map((x: any) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.room?.name}</td>
                  <td>{x.center?.name}</td>
                  <td>{x.client?.companyName || x.bookedBy?.name}</td>
                  <td>{fmtDateTime(x.startTime)}</td>
                  <td>{fmtDateTime(x.endTime)}</td>
                  <td>{x.durationHrs?.toFixed(1)}</td>
                  <td>{x.isChargeable ? fmtINR(x.chargedAmount) : "Within quota"}</td>
                  <td>{x.status}</td>
                  <td>{me && x.bookedById === me.id && <button className="text-xs text-rose-600" onClick={() => cancelBooking(x.id)}>Cancel</button>}</td>
                </tr>
              ))}
              {visibleBookings.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No bookings</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
