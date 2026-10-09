// Bulk import of the sales team's old lead spreadsheets ("Leads Generated.xlsx").
//
// The workbook grew by hand over two years: one master log plus side sheets
// (in discussion, deals closed, visits, brokers), each with slightly different
// headers, free-text seat counts, typo'd dates and several numbers in one cell.
// Everything here is a pure function over cell values so it can be unit tested;
// the API route only reads the file and writes the rows.
//
// Every imported lead gets source "Old Data · <date of enquiry>", so old rows are
// told apart from live leads at a glance and one sheet row maps to one source
// string. Whatever does not fit a column (original channel, status as written,
// "Daypass:3", second phone number) is kept in notes rather than dropped.
import * as XLSX from "xlsx";
import { normaliseIndianPhone, isValidEmail } from "@/lib/validators";
import { fmtDate } from "@/lib/utils";

import { OLD_DATA_SOURCE, importedSourceSuffix } from "@/lib/oldLeads";

export { OLD_DATA_SOURCE, isOldDataSource } from "@/lib/oldLeads";

// Header aliases seen across the sheets. Matched after norm(), exact.
const H: Record<string, string[]> = {
  date: ["date", "date of visit"],
  name: ["client's name", "clients name", "client name", "name"],
  phone: ["mobile no.", "mobile no", "mobile", "number", "phone", "phone no.", "contact"],
  seats: ["no. of seat", "no. of seats", "no of seats", "seats", "cabin type"],
  location: ["location", "center", "centre"],
  company: ["company", "company name"],
  email: ["email", "email id"],
  remarkCall: ["remarks at the time of call", "remarks"],
  remarkFollow: ["remarks at the time of follow up"],
  status: ["status"],
  channel: ["source", "lead source"],
  visit: ["probability of visit", "visit(yes/no)", "visits", "visit"],
  budget: ["budget"],
  quoted: ["quoted price"],
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function text(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : fmtDate(v);
  return String(v ?? "").replace(/\u202C|\u202A/g, "").trim();
}

// A sheet is a lead sheet if some early row names the client and a phone or date
// column. Inventory and summary sheets have neither and are skipped.
export function findHeaderMap(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] || []).map(norm);
    const cols: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(H)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) cols[field] = idx;
    }
    if (cols.name !== undefined && (cols.phone !== undefined || cols.date !== undefined)) {
      return { headerIdx: r, cols };
    }
  }
  return null;
}

// Noon IST, so fmtDate shows the same calendar day the sheet does.
function istNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 6, 30));
}

function validYmd(y: number, m: number, d: number, today: Date): Date | null {
  if (y < 2020 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = istNoon(y, m, d);
  // Rejects 02/29/2025 and the like, which Date silently rolls over.
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  // A date after today is a typo (9/21/2029), not a future enquiry.
  if (dt.getTime() > today.getTime() + 24 * 3600 * 1000) return null;
  return dt;
}

// Sheet dates are US month/day/year, as Excel wrote them. Returns null for
// anything that is not a real past date; the caller keeps the raw text.
export function parseSheetDate(v: unknown, today = new Date()): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate(), today);
  }
  if (typeof v === "number" && v > 0) {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? validYmd(p.y, p.m, p.d, today) : null;
  }
  const m = text(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  return validYmd(Number(m[3]), Number(m[1]), Number(m[2]), today);
}

// All valid Indian mobiles in a cell like "8700015764/7458 943 730" or
// "9811272297 (1 (604) 250-1033 whatsapp)". Excel numbers are read whole, so a
// cell displayed as 9.19872E+11 still yields its full digits.
export function extractPhones(v: unknown): string[] {
  if (typeof v === "number") {
    const p = normaliseIndianPhone(String(Math.round(v)));
    return p ? [p] : [];
  }
  const out: string[] = [];
  for (const piece of text(v).split(/[/,;|&()]|\band\b/i)) {
    const p = normaliseIndianPhone(piece.replace(/\D/g, ""));
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

// "5" → 5, "60-70" → 60, "Daypass:3" → 3 + "Day pass", "Virtual" → "Virtual".
export function parseSeats(v: unknown): { seats: number | null; workspaceType: string | null } {
  const s = text(v);
  const lower = s.toLowerCase();
  let workspaceType: string | null = null;
  if (/day\s*pass|\bdp\b|\d\s*dp\b/.test(lower)) workspaceType = "Day pass";
  else if (lower.includes("virtual")) workspaceType = "Virtual";
  else if (lower.includes("meeting") || lower.includes("conference")) workspaceType = "Meeting room";
  else if (lower.includes("cabin")) workspaceType = "Cabin";
  const n = s.match(/\d+/);
  const seats = n && Number(n[0]) > 0 && Number(n[0]) < 10000 ? Number(n[0]) : null;
  return { seats, workspaceType };
}

// "35k" → 35000, "60000" → 60000. Ranges and prose go to notes instead.
export function parseBudget(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  const m = text(v).replace(/[,₹\s]/g, "").match(/^(\d+(?:\.\d+)?)(k)?$/i);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

// The sheet's status words, mapped onto the CRM pipeline (lib/leadStatus).
export function mapStatus(rawStatus: unknown, visited: boolean): string {
  const s = norm(rawStatus);
  if (s.includes("closed")) return "Payment";
  if (s.includes("discussion")) return visited ? "Visited" : "Connect";
  if (/not interested|denied|mistake|same business|no response|lost/.test(s)) return "Lost";
  return visited ? "Visited" : "Lead";
}

export function isVisited(v: unknown): boolean {
  const s = norm(v);
  return s === "yes" || s.startsWith("visited");
}

// Which center a free-text location means. Mixed values ("CP/GP") match none.
export function matchCenter(location: unknown, centers: { id: string; name: string }[]): string | null {
  const s = norm(location);
  const want: string[] = [];
  if (/noida|sec(tor)?[\s-]*8|\bf-?[25]\b/.test(s)) want.push("noida");
  if (/\bcp\b|connaught/.test(s)) want.push("cp");
  if (/\bgp\b|green park/.test(s)) want.push("gp");
  if (want.length !== 1) return null;
  const token = new RegExp(`(^|[^a-z])${want[0]}([^a-z]|$)`, "i");
  return centers.find((c) => token.test(c.name))?.id ?? null;
}

const BROKER = /dealer|broker|aggregat|realtor|estate agent/i;

export type ImportRow = {
  sheet: string;
  rowNo: number; // 1-based, as Excel shows it
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  seatsNeeded: number | null;
  workspaceType: string | null;
  budget: number | null;
  area: string | null;
  centerId: string | null;
  sourceType: string | null;
  status: string;
  source: string;
  createdAt: Date | null; // null when the sheet date was unreadable
  notes: string;
  remarks: string[];
  dateProblem: string | null;
};

export type ParseResult = {
  rows: ImportRow[];
  skippedSheets: { sheet: string; reason: string }[];
  blankRows: number;
};

export function parseLeadWorkbook(
  wb: XLSX.WorkBook,
  centers: { id: string; name: string }[],
  today = new Date(),
): ParseResult {
  const rows: ImportRow[] = [];
  const skippedSheets: ParseResult["skippedSheets"] = [];
  let blankRows = 0;

  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, blankrows: false, defval: null });
    const map = findHeaderMap(grid);
    if (!map) {
      skippedSheets.push({ sheet, reason: "no Client's Name + Mobile/Date header — not a lead sheet" });
      continue;
    }
    const { cols } = map;
    const cell = (row: unknown[], f: string) => (cols[f] === undefined ? null : row[cols[f]]);

    for (let r = map.headerIdx + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const parsed = parseLeadRow(row, cell, centers, today, sheet, r + 1);
      if (parsed) rows.push(parsed);
      else blankRows++;
    }
  }
  return { rows, skippedSheets, blankRows };
}

function parseLeadRow(
  row: unknown[],
  cell: (row: unknown[], f: string) => unknown,
  centers: { id: string; name: string }[],
  today: Date,
  sheet: string,
  rowNo: number,
): ImportRow | null {
  const rawName = text(cell(row, "name")).replace(/<no name>|^no name$/i, "").trim();
  const rawPhone = cell(row, "phone");
  const rawEmail = text(cell(row, "email"));
  const company = text(cell(row, "company")) || null;

  // Some sheets slipped a column; look for the number in the neighbouring cells.
  let phones = extractPhones(rawPhone);
  if (!phones.length) phones = [...extractPhones(cell(row, "location")), ...extractPhones(cell(row, "seats"))];
  const email = isValidEmail(rawEmail) ? rawEmail.toLowerCase() : null;

  if (!rawName && !phones.length && !email) return null;

  const rawDate = cell(row, "date");
  const date = parseSheetDate(rawDate, today);
  const rawDateText = text(rawDate);
  const source = date
    ? `${OLD_DATA_SOURCE} · ${fmtDate(date)}`
    : rawDateText
      ? `${OLD_DATA_SOURCE} · ${rawDateText}`
      : OLD_DATA_SOURCE;

  const visitRaw = text(cell(row, "visit"));
  const visited = isVisited(visitRaw);
  const statusRaw = text(cell(row, "status"));
  const seatsRaw = text(cell(row, "seats"));
  const { seats, workspaceType } = parseSeats(seatsRaw);
  const budgetRaw = text(cell(row, "budget"));
  const budget = parseBudget(cell(row, "budget"));
  const location = text(cell(row, "location"));
  const channel = text(cell(row, "channel"));
  const quoted = text(cell(row, "quoted"));
  const phoneText = text(rawPhone);

  const notes: string[] = [`Imported from old lead sheet "${sheet}", row ${rowNo}.`];
  if (channel) notes.push(`Original source: ${channel}`);
  if (statusRaw) notes.push(`Original status: ${statusRaw}`);
  if (visitRaw) notes.push(`Visit: ${visitRaw}`);
  if (seatsRaw && String(seats ?? "") !== seatsRaw) notes.push(`Seats (as written): ${seatsRaw}`);
  if (budgetRaw && budget === null) notes.push(`Budget (as written): ${budgetRaw}`);
  if (quoted) notes.push(`Quoted price: ${quoted}`);
  if (phones.length > 1) notes.push(`Other numbers: ${phones.slice(1).join(", ")}`);
  if (phoneText && phoneText.replace(/\D/g, "").replace(/^(91|0)/, "") !== (phones[0] ?? "")) {
    notes.push(`Contact (as written): ${phoneText}`);
  }
  if (rawEmail && !email) notes.push(`Email (as written): ${rawEmail}`);
  if (!date && rawDateText) notes.push(`Date (as written): ${rawDateText}`);

  const remarks = [
    ["Remark at the time of call", text(cell(row, "remarkCall"))],
    ["Remark at follow-up", text(cell(row, "remarkFollow"))],
  ]
    .filter(([, body]) => body)
    .map(([label, body]) => `${label}:\n${body}`);

  return {
    sheet,
    rowNo,
    name: rawName || company || "Unknown",
    phone: phones[0] ?? null,
    email,
    company,
    seatsNeeded: seats,
    workspaceType,
    budget,
    area: location || null,
    centerId: matchCenter(location, centers),
    sourceType: BROKER.test(rawName) ? "Broker" : null,
    status: mapStatus(statusRaw, visited),
    source,
    createdAt: date,
    notes: notes.join("\n"),
    remarks,
    dateProblem: !date ? rawDateText || "(no date)" : null,
  };
}

// One enquiry = one person on one date. The same row copied into a side sheet
// collapses into it; the same person on another date is a separate enquiry.
// Keyed on the date part of the source, so a lead already moved to the main tab
// ("Old Leads · …") still counts as imported when the file is uploaded again.
export function dedupeKey(r: { phone: string | null; email: string | null; name: string; source: string }): string {
  return `${r.phone || r.email || r.name.toLowerCase()}|${importedSourceSuffix(r.source)}`;
}
