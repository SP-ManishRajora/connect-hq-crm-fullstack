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
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
