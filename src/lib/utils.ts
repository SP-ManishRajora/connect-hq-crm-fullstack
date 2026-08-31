export const RATE_THRESHOLD = 8000; // INR per seat — below this needs Manager approval
export const GST_RATE = 0.18;

export function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  // Fixed timeZone so server (UTC) and client (local) render identically — avoids
  // React hydration mismatches.
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// Date + time, with a fixed locale and timezone so server and client render
// identically (avoids React hydration mismatches from host-dependent defaults).
export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nextInvoiceNo(prefix = "INV") {
  return `${prefix}-${Date.now()}`;
}

// ============= MEETING ROOM BOOKING WINDOW =============
// Clients may only START a booking between 08:00 and 19:30 IST. 19:30 is the last
// bookable slot time, NOT a closing time — a 19:00–20:00 booking is valid, and a
// slot may run past 19:30. Only the start is constrained.
// Staff (ADMIN / CENTER_MANAGER etc.) are not bound by this.
export const BOOKING_OPEN_MIN = 8 * 60; // 08:00 — earliest start
export const BOOKING_LAST_START_MIN = 19 * 60 + 30; // 19:30 — latest start
export const BOOKING_OPEN_LABEL = "8:00 AM";
export const BOOKING_LAST_START_LABEL = "7:30 PM";
export const BOOKING_TZ = "Asia/Kolkata";

// Minutes-since-midnight for an instant, read in IST. The server runs UTC, so
// getHours() there would be the wrong clock — this formats in the business
// timezone instead, which is the one the window is defined in.
export function minutesOfDayIST(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BOOKING_TZ,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // 24:00 is a valid en-GB rendering of midnight; normalise it to 0.
  return (h % 24) * 60 + m;
}

// Shared by the portal UI and the bookings API. Returns an error message, or
// null when the start sits inside the bookable window. Only the START is checked
// — a booking is allowed to run past the last slot time (19:00–20:00 is valid).
// The caller has already rejected end <= start, so an overrun is bounded by that.
export function bookingWindowError(start: Date, _end?: Date): string | null {
  const s = minutesOfDayIST(start);
  if (s < BOOKING_OPEN_MIN) return `Bookings cannot start before ${BOOKING_OPEN_LABEL}.`;
  if (s > BOOKING_LAST_START_MIN) return `The last bookable slot is ${BOOKING_LAST_START_LABEL}.`;
  return null;
}

// ============= MONTHLY QUOTA WINDOW =============
// The IST calendar month containing `ref`, as UTC instants for a Prisma range.
//
// new Date(y, m, 1) is SERVER-local. The server runs UTC, so that produced a
// window of 1 Aug 05:30 IST - 1 Sep 05:29 IST: bookings early on the 1st were
// missed and bookings just after midnight on the 1st of the next month were
// counted against the wrong month. Quota is a business figure, so it has to be
// bucketed by the business calendar (IST), not the host's.
export function istMonthRange(ref: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(ref);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  // IST is UTC+5:30 year-round (no DST), so the offset is a constant subtraction.
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  // First instant of the next IST month, used with `lt` so no millisecond of the
  // last day is lost (the old code used `lte` against midnight and dropped it).
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  return { start, end };
}
