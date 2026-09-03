"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDateTime, istMonthRange } from "@/lib/utils";

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

// A meeting always sits inside one day, so the form carries a single Date and two
// 12-hour times. <input type="datetime-local"> renders in the browser locale and cannot
// be forced to 12-hour, hence the explicit hour / minute / AM-PM selects. Values are
// stored as the same "YYYY-MM-DDTHH:mm" strings the rest of the form and API use.
// Add whole/part hours to a "YYYY-MM-DDTHH:mm" value, staying on the same calendar day.
function addHoursDT(value: string, hrs: number) {
  if (!value || !value.includes("T")) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + Math.round(hrs * 60));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Meetings run in minutes/hours, not days — durations offered on the quick picker.
const DURATIONS = [
  { hrs: 0.5, label: "30 min" },
  { hrs: 1, label: "1 hr" },
  { hrs: 1.5, label: "1.5 hr" },
  { hrs: 2, label: "2 hr" },
  { hrs: 3, label: "3 hr" },
];
// Minutes are booked on the quarter hour, matching the calendar grid.
const MINUTE_STEPS = ["00", "15", "30", "45"];
const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));

// The 12-hour clock alone (hour / minute / AM-PM); the date lives beside it.
function Time12({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  // `value` is a bare "HH:mm" (24h); the parent owns the shared date.
  const [hStr, mStr = "00"] = (value || "").split(":");
  const h24 = hStr === "" ? NaN : Number(hStr);
  const hour12 = isNaN(h24) ? "" : String(h24 % 12 === 0 ? 12 : h24 % 12);
  const minute = isNaN(h24) ? "00" : mStr.padStart(2, "0");
  const ampm = !isNaN(h24) && h24 >= 12 ? "PM" : "AM";
  // Emits "HH:mm" back up — the parent re-attaches the date.
  const emitTime = (h: string, m: string, a: string) => {
    if (!h) return onChange("");
    let hh = Number(h) % 12;
    if (a === "PM") hh += 12;
    onChange(`${String(hh).padStart(2, "0")}:${(m || "00").padStart(2, "0")}`);
  };
  return (
    <div className="flex gap-1 items-center">
      <select className="input w-16 px-1" required={required} value={hour12} onChange={(e) => emitTime(e.target.value, minute, ampm)}>
        <option value="">--</option>
        {HOURS_12.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-400">:</span>
      <select className="input w-16 px-1" value={minute || "00"} onChange={(e) => emitTime(hour12 || "9", e.target.value, ampm)}>
        {MINUTE_STEPS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="input w-20 px-1" value={ampm} onChange={(e) => emitTime(hour12 || "9", minute, e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

// Current local time rounded UP to the next quarter hour, so the default start lands
// on one of the 00/15/30/45 options the minute select offers.
function nowRoundedUp() {
  const d = new Date();
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  const next = Math.ceil(m / 15) * 15;
  d.setMinutes(next);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function todayLocalDate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Duration in hours between two "YYYY-MM-DDTHH:mm" values, or null when the pair is
// incomplete/invalid. Both sides are already 24h here — AM/PM was resolved on entry —
// so a plain timestamp comparison is correct.
function durationHrsBetween(startTime: string, endTime: string) {
  if (!startTime || !endTime) return null;
  const st = new Date(startTime).getTime();
  const et = new Date(endTime).getTime();
  if (isNaN(st) || isNaN(et)) return null;
  return (et - st) / 3600000;
}
// Human label for a duration: "45 min", "1 hr", "1 hr 30 min", "2 hr".
function fmtDuration(hrs: number) {
  const mins = Math.round(hrs * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
// The stored value is "YYYY-MM-DDTHH:mm"; these split it into the parts the form edits.
function datePart(v: string) {
  return (v || "").split("T")[0] || "";
}
function timePart(v: string) {
  return (v || "").split("T")[1] || "";
}

const EMPTY_BACKLOG_ROW = { roomId: "", clientId: "", startTime: "", endTime: "", notes: "", error: "" };

export default function BookingsClient({ bookings, clientQuotas = {}, rooms, centers, clients = [], quota, me, canBookOnBehalf, canBackdate, canBacklog }: any) {
  const router = useRouter();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [show, setShow] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [b, setB] = useState<any>({ roomId: "", startTime: "", endTime: "", notes: "", clientId: "", lateEntryReason: "" });
  const [room, setRoom] = useState<any>(EMPTY_ROOM);
  const [err, setErr] = useState<string | null>(null);

  // ── Backlog (historic) entry — Center Manager and above ───────────────────
  const [showBacklog, setShowBacklog] = useState(false);
  const [backlogRows, setBacklogRows] = useState<any[]>([{ ...EMPTY_BACKLOG_ROW }]);
  const [backlogReason, setBacklogReason] = useState("");
  const [backlogErr, setBacklogErr] = useState<string | null>(null);
  const [backlogMsg, setBacklogMsg] = useState<string | null>(null);
  const [backlogSaving, setBacklogSaving] = useState(false);

  // Whether the currently-selected start time is in the past (drives the reason box).
  const startIsPast = useMemo(() => {
    if (!b.startTime) return false;
    return new Date(b.startTime).getTime() < Date.now();
  }, [b.startTime]);

  // Start and End share one date — a meeting runs in hours, never across days.
  // Changing the date moves both ends onto it, keeping each side's time.
  function setBookingDate(date: string) {
    setB((prev: any) => {
      if (!date) return { ...prev, startTime: "", endTime: "" };
      const st = timePart(prev.startTime) || "09:00";
      const et = timePart(prev.endTime) || "10:00";
      return { ...prev, startTime: `${date}T${st}`, endTime: `${date}T${et}` };
    });
  }
  // Set one side's time on the shared date. Moving the start carries the end along
  // by the current duration, so the meeting length survives a start-time change.
  function setBookingTime(field: "startTime" | "endTime", time: string) {
    setB((prev: any) => {
      const date = datePart(prev.startTime) || datePart(prev.endTime) || todayLocalDate();
      if (!time) return { ...prev, [field]: "" };
      const next = `${date}T${time}`;
      if (field === "endTime") return { ...prev, endTime: next, startTime: prev.startTime || `${date}T${time}` };
      // Start moved — shift the end by the same delta to preserve the duration.
      const prevStart = prev.startTime ? new Date(prev.startTime).getTime() : NaN;
      const prevEnd = prev.endTime ? new Date(prev.endTime).getTime() : NaN;
      const keepHrs = !isNaN(prevStart) && !isNaN(prevEnd) && prevEnd > prevStart ? (prevEnd - prevStart) / 3600000 : 1;
      return { ...prev, startTime: next, endTime: addHoursDT(next, keepHrs) };
    });
  }
  // Signed booking length — negative/zero means End is at or before Start, which the
  // range error below reports. The duration chips match only on a positive value.
  const bookingSpanHrs = useMemo(() => durationHrsBetween(b.startTime, b.endTime), [b.startTime, b.endTime]);
  const bookingDurationHrs = bookingSpanHrs !== null && bookingSpanHrs > 0 ? bookingSpanHrs : null;
  // End must be strictly after Start. Times are stored 24h, so AM/PM is already applied.
  const rangeError = useMemo(() => {
    if (!b.startTime || !b.endTime || bookingSpanHrs === null) return null;
    if (bookingSpanHrs < 0) return "End time cannot be earlier than the start time.";
    if (bookingSpanHrs === 0) return "End time must be after the start time.";
    return null;
  }, [b.startTime, b.endTime, bookingSpanHrs]);

  // Filters
  const [centerFilter, setCenterFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");

  // Week anchor. Initialised on the client only (avoids server/client "today" mismatch).
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  useEffect(() => { setWeekStart(startOfWeek(new Date())); }, []);

  const canAddRoom = me && ["ADMIN", "OWNER", "CENTER_MANAGER"].includes(me.role);

  const isStaff = Boolean(canBookOnBehalf);

  // A Center Manager may only backfill rooms in their own center (the API enforces
  // this too — scoping the picker keeps them from choosing a row that will fail).
  const backlogRooms = useMemo(
    () =>
      me?.role === "CENTER_MANAGER" && me?.centerId
        ? rooms.filter((r: any) => r.centerId === me.centerId)
        : rooms,
    [rooms, me],
  );

  const roomsInScope = useMemo(
    () => rooms.filter((r: any) => (centerFilter ? r.centerId === centerFilter : true)),
    [rooms, centerFilter],
  );

  // Remaining quota for the client on a row, for the IST month that booking falls in.
  // Same key the server builds: `${clientId}:${ISO of IST month start}`.
  function quotaLeft(x: any) {
    if (!x.clientId) return <span className="text-gray-400">—</span>;
    const q = clientQuotas[`${x.clientId}:${istMonthRange(new Date(x.startTime)).start.toISOString()}`];
    if (!q) return <span className="text-gray-400">—</span>;
    return (
      <span className={q.remainingHrs <= 0 ? "text-rose-600" : ""} title={`${q.usedHrs.toFixed(1)} of ${q.totalHrs} hrs used`}>
        {q.remainingHrs.toFixed(1)} / {q.totalHrs} hrs
      </span>
    );
  }

  // Per-row backlog duration: green pill when valid, red message when End <= Start.
  function backlogDurationCell(r: any) {
    const hrs = durationHrsBetween(r.startTime, r.endTime);
    if (hrs === null) return <span className="text-gray-400">—</span>;
    if (hrs <= 0) return <span className="text-rose-600 text-xs">End must be after start</span>;
    return (
      <span className="badge bg-emerald-100 text-emerald-800" title={`${hrs.toFixed(2)} hrs`}>
        {fmtDuration(hrs)}
      </span>
    );
  }

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
    if (rangeError) {
      setErr(rangeError);
      return;
    }
    if (startIsPast && !canBackdate) {
      setErr("Bookings cannot be made for a past date/time.");
      return;
    }
    if (startIsPast && canBackdate && !String(b.lateEntryReason || "").trim()) {
      setErr("Please enter a reason for this past (late-entry) booking.");
      return;
    }
    const payload: any = { roomId: b.roomId, startTime: b.startTime, endTime: b.endTime, notes: b.notes };
    if (isStaff && b.clientId) payload.clientId = b.clientId;
    if (startIsPast && canBackdate) payload.lateEntryReason = b.lateEntryReason;
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { setShow(false); setB({ roomId: "", startTime: "", endTime: "", notes: "", clientId: "", lateEntryReason: "" }); router.refresh(); }
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

  function setBacklogRow(i: number, patch: any) {
    setBacklogRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch, error: "" } : r)));
  }

  // A backlog booking always sits inside a single day, so the row carries one date
  // and two times. Setting the date moves both ends onto it, keeping their times.
  function setBacklogDate(i: number, date: string) {
    setBacklogRows((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        if (!date) return { ...r, startTime: "", endTime: "", error: "" };
        const st = timePart(r.startTime) || "09:00";
        const et = timePart(r.endTime) || "10:00";
        return { ...r, startTime: `${date}T${st}`, endTime: `${date}T${et}`, error: "" };
      }),
    );
  }
  // Set one side's time on the row's shared date; moving the start carries the end
  // along by the current duration so the meeting length is preserved.
  function setBacklogTimeOnly(i: number, field: "startTime" | "endTime", time: string) {
    setBacklogRows((rows) =>
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const date = datePart(r.startTime) || datePart(r.endTime) || todayLocalDate();
        if (!time) return { ...r, [field]: "", error: "" };
        const next = `${date}T${time}`;
        if (field === "endTime") return { ...r, endTime: next, error: "" };
        const prevStart = r.startTime ? new Date(r.startTime).getTime() : NaN;
        const prevEnd = r.endTime ? new Date(r.endTime).getTime() : NaN;
        const keepHrs = !isNaN(prevStart) && !isNaN(prevEnd) && prevEnd > prevStart ? (prevEnd - prevStart) / 3600000 : 1;
        return { ...r, startTime: next, endTime: addHoursDT(next, keepHrs), error: "" };
      }),
    );
  }
  function addBacklogRow() {
    setBacklogRows((rows) => [...rows, { ...EMPTY_BACKLOG_ROW }]);
  }
  function removeBacklogRow(i: number) {
    setBacklogRows((rows) => (rows.length === 1 ? [{ ...EMPTY_BACKLOG_ROW }] : rows.filter((_, idx) => idx !== i)));
  }
  function resetBacklog() {
    setBacklogRows([{ ...EMPTY_BACKLOG_ROW }]);
    setBacklogReason("");
    setBacklogErr(null);
    setBacklogMsg(null);
  }

  async function submitBacklog(e: React.FormEvent) {
    e.preventDefault();
    setBacklogErr(null);
    setBacklogMsg(null);

    if (!backlogReason.trim()) {
      setBacklogErr("Please enter a reason for this backlog entry.");
      return;
    }
    const filled = backlogRows.filter((r) => r.roomId && r.startTime && r.endTime);
    if (filled.length === 0) {
      setBacklogErr("Fill in at least one complete row (room, start and end).");
      return;
    }
    // End must be strictly after Start on every row (times are 24h, AM/PM already applied).
    const badRange = filled.find((r) => {
      const hrs = durationHrsBetween(r.startTime, r.endTime);
      return hrs === null || hrs <= 0;
    });
    if (badRange) {
      setBacklogErr("Every row's end time must be after its start time.");
      return;
    }
    // Client-side pre-check: backlog is for slots that already happened.
    const future = filled.find((r) => new Date(r.startTime).getTime() >= Date.now());
    if (future) {
      setBacklogErr("Backlog entries must start in the past. Use “+ Book Room” for upcoming slots.");
      return;
    }

    setBacklogSaving(true);
    try {
      const res = await fetch("/api/bookings/backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lateEntryReason: backlogReason.trim(),
          rows: filled.map((r) => ({
            roomId: r.roomId,
            clientId: r.clientId || null,
            startTime: r.startTime,
            endTime: r.endTime,
            notes: r.notes || null,
          })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBacklogErr(j.error || "Failed to save backlog entries");
        return;
      }

      // Keep only the rows that failed, annotated with their error, so the
      // manager can correct and resubmit without retyping the good ones.
      const failed: any[] = [];
      (j.results || []).forEach((r: any) => {
        if (!r.ok) failed.push({ ...filled[r.index], error: r.error || "Failed" });
      });

      if (failed.length === 0) {
        setBacklogMsg(`${j.created} backlog booking${j.created === 1 ? "" : "s"} recorded.`);
        setBacklogRows([{ ...EMPTY_BACKLOG_ROW }]);
        setBacklogReason("");
      } else {
        setBacklogRows(failed);
        setBacklogErr(`${j.created} saved, ${failed.length} could not be saved — see the errors below.`);
      }
      router.refresh();
    } finally {
      setBacklogSaving(false);
    }
  }

  // Open the booking form with the start defaulted to the CURRENT time (rounded to the
  // next quarter hour) and a 1-hour slot. Recomputed on every open so a form reopened
  // later shows the time now, not the time it was first opened. Seeded here rather than
  // in useState so the server and client first render agree — new Date() would differ.
  function openBookingForm() {
    const start = nowRoundedUp();
    setB((prev: any) => ({ ...prev, startTime: start, endTime: addHoursDT(start, 1), lateEntryReason: "" }));
    setShow(true);
  }

  // Open the booking form prefilled from a clicked calendar slot (1-hour default).
  function openSlot(day: Date, hour: number) {
    const start = new Date(day); start.setHours(hour, 0, 0, 0);
    const end = new Date(start); end.setHours(hour + 1, 0, 0, 0);
    // Clients (and other non-backdate roles) cannot book past slots.
    if (start.getTime() < Date.now() && !canBackdate) return;
    setErr(null);
    setB((prev: any) => ({
      ...prev,
      roomId: roomFilter || prev.roomId || (roomsInScope[0]?.id ?? ""),
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      lateEntryReason: "",
    }));
    setShow(true);
  }

  const weekDays = weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [];
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
  const now = weekStart ? new Date() : null;
  const todayStart = weekStart ? startOfWeek(new Date()) : null; // used to gate past-week navigation
  // Non-backdate users can't page to a week entirely in the past.
  const prevWeekAllowed = canBackdate || (weekStart && todayStart ? weekStart > todayStart : true);

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
          {canBacklog && (
            <button type="button" className="btn-ghost" onClick={() => { setBacklogErr(null); setBacklogMsg(null); setShowBacklog(!showBacklog); }}>
              + Backlog Entry
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => { setErr(null); if (!show) openBookingForm(); else setShow(false); }}>+ Book Room</button>
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
            <button type="button" className="btn-ghost disabled:opacity-40" disabled={!prevWeekAllowed} title={prevWeekAllowed ? "" : "Past dates are not available"} onClick={() => prevWeekAllowed && setWeekStart(addDays(weekStart, -7))}>← Prev</button>
            <button type="button" className="btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
            <button type="button" className="btn-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
            <span className="text-sm muted">{weekDays[0]?.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – {weekDays[6]?.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            {!canBackdate && <span className="text-xs muted">Past dates unavailable</span>}
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

      {showBacklog && canBacklog && (
        <form onSubmit={submitBacklog} className="card space-y-3 border-amber-300">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="h2">Backlog Entry — record past bookings</h2>
              <p className="muted text-xs">
                For meeting room usage that already happened but was never entered. Every row is stored as a
                late entry with the reason below and shows a <span className="badge bg-amber-100 text-amber-800">late entry</span> tag in the list view.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={addBacklogRow}>+ Add row</button>
          </div>

          <div>
            <label className="label">Reason for backlog entry *</label>
            <textarea
              className="input"
              rows={2}
              required
              value={backlogReason}
              onChange={(e) => setBacklogReason(e.target.value)}
              placeholder="e.g. Migrated from the front-desk register for July 2026"
            />
            <p className="muted text-xs mt-1">Applies to every row in this submission and is stored with each booking.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Room *</th>
                  {isStaff && <th>Client</th>}
                  <th>Date *</th>
                  <th>Start *</th>
                  <th>End *</th>
                  <th>Hrs</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backlogRows.map((r, i) => (
                  <tr key={i} className={r.error ? "bg-rose-50" : ""}>
                    <td>
                      <select className="input" value={r.roomId} onChange={(e) => setBacklogRow(i, { roomId: e.target.value })}>
                        <option value="">— Select —</option>
                        {backlogRooms.map((rm: any) => (
                          <option key={rm.id} value={rm.id}>{rm.center.name} — {rm.name}</option>
                        ))}
                      </select>
                    </td>
                    {isStaff && (
                      <td>
                        <select className="input" value={r.clientId} onChange={(e) => setBacklogRow(i, { clientId: e.target.value })}>
                          <option value="">— Walk-in / none —</option>
                          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                        </select>
                      </td>
                    )}
                    <td>
                      <input className="input" type="date" value={datePart(r.startTime) || datePart(r.endTime)} onChange={(e) => setBacklogDate(i, e.target.value)} />
                    </td>
                    <td>
                      <Time12 value={timePart(r.startTime)} onChange={(t) => setBacklogTimeOnly(i, "startTime", t)} />
                    </td>
                    <td>
                      <Time12 value={timePart(r.endTime)} onChange={(t) => setBacklogTimeOnly(i, "endTime", t)} />
                    </td>
                    <td className="whitespace-nowrap">{backlogDurationCell(r)}</td>
                    <td>
                      <input className="input" value={r.notes} onChange={(e) => setBacklogRow(i, { notes: e.target.value })} placeholder="Optional" />
                    </td>
                    <td>
                      <button type="button" className="text-xs text-rose-600" onClick={() => removeBacklogRow(i)} title="Remove this row">Remove</button>
                    </td>
                  </tr>
                ))}
                {backlogRows.some((r) => r.error) && (
                  <tr>
                    <td colSpan={isStaff ? 8 : 7} className="text-xs text-rose-700">
                      {backlogRows.filter((r) => r.error).map((r, i) => <div key={i}>• {r.error}</div>)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="muted text-xs">Each row is one day — pick the date once, then the start and end times.</p>

          {backlogErr && <p className="text-red-600 text-sm">{backlogErr}</p>}
          {backlogMsg && <p className="text-emerald-700 text-sm">{backlogMsg}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setShowBacklog(false); resetBacklog(); }}>Close</button>
            <button type="button" className="btn-ghost" onClick={resetBacklog}>Clear</button>
            <button className="btn-primary" disabled={backlogSaving}>{backlogSaving ? "Saving…" : "Save Backlog Entries"}</button>
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
          <div className="sm:col-span-2">
            <label className="label">Date *</label>
            <input className="input" type="date" required value={datePart(b.startTime)} onChange={(e) => setBookingDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Start time *</label>
            <Time12 required value={timePart(b.startTime)} onChange={(t) => setBookingTime("startTime", t)} />
          </div>
          <div>
            <label className="label">End time *</label>
            <Time12 required value={timePart(b.endTime)} onChange={(t) => setBookingTime("endTime", t)} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <span className="muted text-xs">Duration:</span>
            {DURATIONS.map((d) => (
              <button
                key={d.hrs}
                type="button"
                className={`badge ${bookingDurationHrs === d.hrs ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                onClick={() => setB((prev: any) => ({ ...prev, endTime: addHoursDT(prev.startTime, d.hrs) }))}
                disabled={!b.startTime}
              >
                {d.label}
              </button>
            ))}
            {bookingDurationHrs !== null && (
              <span className="badge bg-emerald-100 text-emerald-800 ml-auto" title={`${bookingDurationHrs.toFixed(2)} hrs`}>
                {fmtDuration(bookingDurationHrs)} ({bookingDurationHrs.toFixed(1)} hrs)
              </span>
            )}
          </div>
          {rangeError && <p className="sm:col-span-2 text-rose-600 text-sm">{rangeError}</p>}
          {startIsPast && !canBackdate && (
            <p className="sm:col-span-2 text-rose-600 text-sm">Bookings cannot be made for a past date/time.</p>
          )}
          {startIsPast && canBackdate && (
            <div className="sm:col-span-2 rounded border border-amber-300 bg-amber-50 p-3">
              <label className="label text-amber-900">Reason for late entry (past booking) *</label>
              <textarea className="input" rows={2} required value={b.lateEntryReason} onChange={(e) => setB({ ...b, lateEntryReason: e.target.value })} placeholder="Why is this booking being recorded for a past date/time?" />
              <p className="muted text-xs mt-1">This booking's start time is in the past. A reason is required and will be stored with the booking.</p>
            </div>
          )}
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></div>
          {err && <p className="sm:col-span-2 text-red-600 text-sm">{err}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary disabled:opacity-40" disabled={Boolean(rangeError)}>Confirm Booking</button></div>
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
                      {/* Hour cells (clickable to book). Past slots are disabled for non-backdate roles. */}
                      {hours.map((h) => {
                        const cell = new Date(day); cell.setHours(h, 0, 0, 0);
                        const isPastCell = now ? cell.getTime() < now.getTime() : false;
                        const disabled = isPastCell && !canBackdate;
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={disabled}
                            title={disabled ? "Past dates are not available" : "Book this slot"}
                            onClick={() => openSlot(day, h)}
                            className={`block w-full border-b border-gray-100 ${disabled ? "bg-gray-100/70 cursor-not-allowed" : "hover:bg-brand-50/60"}`}
                            style={{ height: HOUR_PX }}
                          />
                        );
                      })}
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
            <thead><tr><th>Room</th><th>Center</th><th>Booked By</th><th>Start</th><th>End</th><th>Hrs</th><th>Charge</th><th>Quota Left</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {visibleBookings.map((x: any) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.room?.name}</td>
                  <td>{x.center?.name}</td>
                  <td>{x.client?.companyName || x.bookedBy?.name}</td>
                  <td>
                    {fmtDateTime(x.startTime)}
                    {x.lateEntryReason && <span className="badge bg-amber-100 text-amber-800 ml-1" title={`Late entry: ${x.lateEntryReason}`}>late entry</span>}
                  </td>
                  <td>{fmtDateTime(x.endTime)}</td>
                  <td>{x.durationHrs?.toFixed(1)}</td>
                  <td>{x.isChargeable ? fmtINR(x.chargedAmount) : "Within quota"}</td>
                  <td>{quotaLeft(x)}</td>
                  <td>{x.status}</td>
                  <td>{me && x.bookedById === me.id && <button className="text-xs text-rose-600" onClick={() => cancelBooking(x.id)}>Cancel</button>}</td>
                </tr>
              ))}
              {visibleBookings.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-8">No bookings</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
