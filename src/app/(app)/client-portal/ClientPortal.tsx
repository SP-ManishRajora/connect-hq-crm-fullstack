"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fmtINR,
  fmtDateTime,
  bookingWindowError,
  BOOKING_OPEN_LABEL,
  BOOKING_LAST_START_LABEL,
} from "@/lib/utils";

// Bounds for the START picker only — 19:30 is the last bookable slot, not a
// closing time, so the END picker is left unbounded (a slot may run past it).
// bookingWindowError() is the real check, and it runs again server-side.
const START_MIN = "08:00";
const START_MAX = "19:30";

const CATS = ["COMPLAINT", "REQUEST", "IT", "FACILITY"];

// Local-time "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" for the `min` attribute on the
// date pickers. toISOString() is UTC and would shift the floor by the timezone
// offset, letting an earlier-today slot through (or blocking a valid one).
function localNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { date, dateTime: `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Field-level validation shared by the filter bar and the booking form.
// Returns { start?, end? } keyed by field so each message renders under the input
// it belongs to. Empty values are not errors here — "required" is handled
// separately so the form does not shout at a field the user has not reached yet.
function validateSlot(startStr: string, endStr: string) {
  const errs: { start?: string; end?: string } = {};
  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr) : null;

  if (startStr && (!start || isNaN(start.getTime()))) errs.start = "Enter a valid start time.";
  if (endStr && (!end || isNaN(end.getTime()))) errs.end = "Enter a valid end time.";
  if (errs.start || errs.end) return errs;

  if (start) {
    if (start.getTime() < Date.now()) errs.start = "Cannot book a slot in the past.";
    else {
      const w = bookingWindowError(start);
      if (w) errs.start = w;
    }
  }
  if (start && end && end <= start) errs.end = "End time must be after the start time.";
  return errs;
}

function parseAmenities(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export default function ClientPortal({ user, client, tickets, notices, invoices, upcoming, history, rooms, quota }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [t, setT] = useState<any>({ category: "COMPLAINT", subject: "", body: "" });
  const [feedback, setFeedback] = useState({ rating: 5, body: "" });

  // Room browser filters
  const [filters, setFilters] = useState({ date: "", start: "", end: "", capacity: "" });
  const [availability, setAvailability] = useState<Record<string, boolean> | null>(null);
  const [checking, setChecking] = useState(false);
  const [filterMsg, setFilterMsg] = useState<string | null>(null);

  // Booking form
  const [booking, setBooking] = useState<any>({ roomId: "", startTime: "", endTime: "", notes: "" });
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remainingHrs = quota ? Math.max(0, quota.totalHrs - quota.usedHrs) : null;

  // Floor for both pickers. Clients cannot back-date: the API rejects a past
  // start (only ADMIN / CENTER_MANAGER may late-enter), so the UI must not
  // offer one. Computed once per render — good enough for a picker floor.
  const minNow = useMemo(() => localNow(), []);

  // Live validation. Recomputed on every keystroke so the message appears as the
  // user types rather than only after a failed submit.
  const filterErrs = useMemo(
    () =>
      filters.date && (filters.start || filters.end)
        ? validateSlot(
            filters.start ? `${filters.date}T${filters.start}` : "",
            filters.end ? `${filters.date}T${filters.end}` : "",
          )
        : {},
    [filters.date, filters.start, filters.end],
  );
  const bookErrs = useMemo(
    () => validateSlot(booking.startTime, booking.endTime),
    [booking.startTime, booking.endTime],
  );
  const bookReady =
    Boolean(booking.roomId && booking.startTime && booking.endTime) &&
    !bookErrs.start &&
    !bookErrs.end;

  // Rooms filtered by capacity + (if availability computed) by free/busy.
  const filteredRooms = useMemo(() => {
    const minCap = Number(filters.capacity) || 0;
    return rooms.filter((r: any) => (minCap ? r.capacity >= minCap : true));
  }, [rooms, filters.capacity]);

  function slotFromFilters() {
    if (!filters.date || !filters.start || !filters.end) return null;
    const start = new Date(`${filters.date}T${filters.start}`);
    const end = new Date(`${filters.date}T${filters.end}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
    return { start, end };
  }

  async function checkAvailability() {
    setFilterMsg(null);
    if (!filters.date || !filters.start || !filters.end) {
      setAvailability(null);
      setFilterMsg("Pick a date, start and end time to check availability.");
      return;
    }
    // The per-field errors are already on screen; this just blocks the request.
    if (filterErrs.start || filterErrs.end) {
      setAvailability(null);
      return;
    }
    const slot = slotFromFilters();
    if (!slot) {
      setAvailability(null);
      setFilterMsg("Pick a date, start and end time (end after start) to check availability.");
      return;
    }
    setChecking(true);
    const qs = new URLSearchParams({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      ...(filters.capacity ? { minCapacity: filters.capacity } : {}),
      ...(client?.centerId ? { centerId: client.centerId } : {}),
    });
    const res = await fetch(`/api/meeting-rooms?${qs}`);
    setChecking(false);
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, boolean> = {};
      data.forEach((r: any) => (map[r.id] = r.available));
      setAvailability(map);
    }
  }

  // Prefill the booking form from the current filter slot for a given room.
  function startBooking(roomId: string) {
    const slot = slotFromFilters();
    setBookErr(null);
    setBooking({
      roomId,
      startTime: slot ? `${filters.date}T${filters.start}` : "",
      endTime: slot ? `${filters.date}T${filters.end}` : "",
      notes: "",
    });
    setShow(false);
    document.getElementById("book-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setBookErr(null);
    if (!booking.roomId) return setBookErr("Select a room.");
    if (!booking.startTime || !booking.endTime) return setBookErr("Enter a start and end time.");
    // Same checks that drive the inline messages, re-run here so a submit can
    // never outrun them. The server validates again regardless.
    const errs = validateSlot(booking.startTime, booking.endTime);
    if (errs.start || errs.end) return setBookErr(errs.start || errs.end || "Invalid slot.");
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    setBusy(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: booking.roomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        notes: booking.notes,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setBooking({ roomId: "", startTime: "", endTime: "", notes: "" });
      setAvailability(null);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setBookErr(j.error || "Booking failed");
    }
  }

  async function cancelBooking(id: string) {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
    if (res.ok) router.refresh();
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Could not cancel");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...t, clientId: client?.id }) });
    setT({ category: "COMPLAINT", subject: "", body: "" });
    router.refresh();
  }
  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...feedback, clientId: client?.id }) });
    setFeedback({ rating: 5, body: "" });
    alert("Thanks for your feedback!");
  }

  const selectedRoom = rooms.find((r: any) => r.id === booking.roomId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Welcome, {user.name}</h1>
        {client ? (
          <p className="muted">Center: {client.center?.name} · Company: {client.companyName}</p>
        ) : (
          <p className="muted">Note: no client record found for {user.email}. Booking is limited.</p>
        )}
      </div>

      {/* Dashboard summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs muted uppercase tracking-wide">Upcoming bookings</div>
          <div className="text-2xl font-bold mt-1">{upcoming.length}</div>
        </div>
        <div className="card">
          <div className="text-xs muted uppercase tracking-wide">Meeting rooms</div>
          <div className="text-2xl font-bold mt-1">{rooms.length}</div>
        </div>
        <div className="card">
          <div className="text-xs muted uppercase tracking-wide">Quota remaining</div>
          <div className="text-2xl font-bold mt-1">{quota ? `${remainingHrs!.toFixed(1)} hrs` : "—"}</div>
          {quota && <div className="muted text-xs">of {quota.totalHrs} hrs in {quota.monthLabel || "this month"}</div>}
        </div>
      </div>

      {/* Upcoming bookings */}
      <div className="card">
        <h2 className="h2">Upcoming bookings</h2>
        <div className="mt-2 space-y-2">
          {upcoming.map((x: any) => (
            <div key={x.id} className="border rounded p-3 text-sm flex justify-between items-center flex-wrap gap-2">
              <div>
                <div className="font-medium">{x.room?.name} <span className="muted">· {x.center?.name}</span></div>
                <div className="text-xs muted">{fmtDateTime(x.startTime)} → {fmtDateTime(x.endTime)}</div>
                <div className="text-xs">{x.isChargeable ? `Charge: ${fmtINR(x.chargedAmount)}` : "Within quota"}</div>
              </div>
              <button className="btn-ghost text-rose-600" onClick={() => cancelBooking(x.id)}>Cancel</button>
            </div>
          ))}
          {upcoming.length === 0 && <p className="muted">No upcoming bookings.</p>}
        </div>
      </div>

      {/* Room browser + filters */}
      <div className="card">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="h2">Available meeting rooms</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs muted">Slots from {BOOKING_OPEN_LABEL}; last booking {BOOKING_LAST_START_LABEL}</span>
            {quota && (
              <span className="text-xs muted">Quota{quota.monthLabel ? ` (${quota.monthLabel})` : ""}: {quota.usedHrs.toFixed(1)}/{quota.totalHrs} hrs used</span>
            )}
          </div>
        </div>
        <div className="grid sm:grid-cols-4 gap-2 mt-3">
          <div><label className="label">Date</label><input className="input" type="date" min={minNow.date} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></div>
          <div>
            <label className="label">From</label>
            <input
              className={`input ${filterErrs.start ? "border-red-500 focus:ring-red-500" : ""}`}
              type="time" min={START_MIN} max={START_MAX} value={filters.start}
              aria-invalid={Boolean(filterErrs.start)}
              onChange={(e) => { setFilterMsg(null); setFilters({ ...filters, start: e.target.value }); }}
            />
            {filterErrs.start && <p className="text-red-600 text-xs mt-1">{filterErrs.start}</p>}
          </div>
          <div>
            <label className="label">To</label>
            <input
              className={`input ${filterErrs.end ? "border-red-500 focus:ring-red-500" : ""}`}
              type="time" value={filters.end}
              aria-invalid={Boolean(filterErrs.end)}
              onChange={(e) => { setFilterMsg(null); setFilters({ ...filters, end: e.target.value }); }}
            />
            {filterErrs.end && <p className="text-red-600 text-xs mt-1">{filterErrs.end}</p>}
          </div>
          <div><label className="label">Min capacity</label><input className="input" type="number" min={1} value={filters.capacity} onChange={(e) => setFilters({ ...filters, capacity: e.target.value })} placeholder="Any" /></div>
        </div>
        <div className="mt-2 flex gap-2 items-center flex-wrap">
          <button
            className="btn-primary"
            onClick={checkAvailability}
            disabled={checking || Boolean(filterErrs.start || filterErrs.end)}
          >
            {checking ? "Checking…" : "Check availability"}
          </button>
          {availability && <button className="btn-ghost" onClick={() => setAvailability(null)}>Clear</button>}
          {filterMsg && <span className="text-red-600 text-xs">{filterMsg}</span>}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {filteredRooms.map((r: any) => {
            const avail = availability ? availability[r.id] : null;
            const amenities = parseAmenities(r.amenities);
            return (
              <div key={r.id} className="border rounded p-3 text-sm">
                <div className="flex justify-between items-start">
                  <div className="font-medium">{r.name}</div>
                  {avail === true && <span className="badge bg-green-100 text-green-800">Available</span>}
                  {avail === false && <span className="badge bg-rose-100 text-rose-800">Booked</span>}
                </div>
                <div className="text-xs muted">{r.center?.name}</div>
                <div className="mt-1">Capacity: {r.capacity} · {r.hourlyRate > 0 ? `${fmtINR(r.hourlyRate)}/hr` : "Within quota"}</div>
                {amenities.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {amenities.map((a) => <span key={a} className="badge bg-gray-100 text-xs">{a}</span>)}
                  </div>
                )}
                <button className="btn-ghost mt-2" disabled={avail === false} onClick={() => startBooking(r.id)}>
                  {avail === false ? "Unavailable" : "Book this room"}
                </button>
              </div>
            );
          })}
          {filteredRooms.length === 0 && <p className="muted">No rooms match your filters.</p>}
        </div>
      </div>

      {/* Booking form */}
      <div className="card" id="book-form">
        <h2 className="h2">Book a room</h2>
        <form onSubmit={submitBooking} className="grid sm:grid-cols-2 gap-3 mt-3">
          <div className="sm:col-span-2">
            <label className="label">Room *</label>
            <select className="input" required value={booking.roomId} onChange={(e) => setBooking({ ...booking, roomId: e.target.value })}>
              <option value="">— Select —</option>
              {rooms.map((r: any) => (
                <option key={r.id} value={r.id}>{r.center?.name} — {r.name} (cap {r.capacity}, {r.hourlyRate > 0 ? `${fmtINR(r.hourlyRate)}/hr` : "quota"})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start *</label>
            <input
              className={`input ${bookErrs.start ? "border-red-500 focus:ring-red-500" : ""}`}
              type="datetime-local" required min={minNow.dateTime} value={booking.startTime}
              aria-invalid={Boolean(bookErrs.start)}
              onChange={(e) => { setBookErr(null); setBooking({ ...booking, startTime: e.target.value }); }}
            />
            {bookErrs.start
              ? <p className="text-red-600 text-xs mt-1">{bookErrs.start}</p>
              : <p className="text-xs muted mt-1">Between {BOOKING_OPEN_LABEL} and {BOOKING_LAST_START_LABEL}</p>}
          </div>
          <div>
            <label className="label">End *</label>
            <input
              className={`input ${bookErrs.end ? "border-red-500 focus:ring-red-500" : ""}`}
              type="datetime-local" required min={booking.startTime || minNow.dateTime} value={booking.endTime}
              aria-invalid={Boolean(bookErrs.end)}
              onChange={(e) => { setBookErr(null); setBooking({ ...booking, endTime: e.target.value }); }}
            />
            {bookErrs.end && <p className="text-red-600 text-xs mt-1">{bookErrs.end}</p>}
          </div>
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={booking.notes} onChange={(e) => setBooking({ ...booking, notes: e.target.value })} /></div>
          {selectedRoom && parseAmenities(selectedRoom.amenities).length > 0 && (
            <div className="sm:col-span-2 text-xs muted">Amenities: {parseAmenities(selectedRoom.amenities).join(", ")}</div>
          )}
          {bookErr && <p className="sm:col-span-2 text-red-600 text-sm">{bookErr}</p>}
          <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={busy || !bookReady}>{busy ? "Booking…" : "Confirm booking"}</button></div>
        </form>
      </div>

      {/* Booking history */}
      <div className="card overflow-x-auto">
        <h2 className="h2">Booking history</h2>
        <table className="table mt-2">
          <thead><tr><th>Room</th><th>Center</th><th>Start</th><th>End</th><th>Hrs</th><th>Charge</th><th>Status</th></tr></thead>
          <tbody>
            {history.map((x: any) => (
              <tr key={x.id}>
                <td className="font-medium">{x.room?.name}</td>
                <td>{x.center?.name}</td>
                <td className="text-xs">{fmtDateTime(x.startTime)}</td>
                <td className="text-xs">{fmtDateTime(x.endTime)}</td>
                <td>{x.durationHrs?.toFixed(1)}</td>
                <td>{x.isChargeable ? fmtINR(x.chargedAmount) : "Within quota"}</td>
                <td>{x.status}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-6">No past bookings</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Tickets + feedback */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex justify-between items-center"><h2 className="h2">Raise complaint / request</h2></div>
          <form onSubmit={submit} className="mt-3 space-y-2">
            <select className="input" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <input className="input" placeholder="Subject" required value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
            <textarea className="input" rows={3} placeholder="Describe..." required value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
            <button className="btn-primary">Submit</button>
          </form>
          <div className="mt-3 space-y-2">
            {tickets.map((x: any) => (
              <div key={x.id} className="border rounded p-2 text-sm">
                <div className="flex justify-between"><span className="font-medium">{x.subject}</span><span className="badge bg-gray-100">{x.status}</span></div>
                <div className="text-xs text-gray-500">{x.category} · {fmtDateTime(x.createdAt)}</div>
              </div>
            ))}
            {tickets.length === 0 && <p className="muted">No tickets yet</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Quick feedback</h2>
          <form onSubmit={submitFeedback} className="mt-3 space-y-2">
            <div>
              <label className="label">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button type="button" key={r} className={`text-2xl ${r <= feedback.rating ? "text-amber-500" : "text-gray-300"}`} onClick={() => setFeedback({ ...feedback, rating: r })}>★</button>
                ))}
              </div>
            </div>
            <textarea className="input" rows={3} placeholder="Tell us..." value={feedback.body} onChange={(e) => setFeedback({ ...feedback, body: e.target.value })} />
            <button className="btn-primary">Submit</button>
          </form>
        </div>
      </div>

      {/* Notices */}
      <div className="card">
        <h2 className="h2">Notice board</h2>
        <div className="space-y-2 mt-2">
          {notices.map((n: any) => (
            <div key={n.id} className={`border rounded p-3 text-sm ${n.isAd ? "bg-amber-50" : ""}`}>
              <div className="font-medium">{n.title} {n.isAd && <span className="badge bg-amber-200 text-amber-900 ml-1">Ad: {n.brand}</span>}</div>
              <div className="muted text-xs">{fmtDateTime(n.createdAt)}</div>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
          {notices.length === 0 && <p className="muted">No notices</p>}
        </div>
      </div>

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="h2">My Invoices</h2>
          <table className="table mt-2">
            <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i: any) => (
                <tr key={i.id}>
                  <td className="font-mono text-xs">{i.invoiceNo}</td>
                  <td className="text-xs">{fmtDateTime(i.periodStart)} → {fmtDateTime(i.periodEnd)}</td>
                  <td>{fmtINR(i.totalAmount)}</td>
                  <td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
