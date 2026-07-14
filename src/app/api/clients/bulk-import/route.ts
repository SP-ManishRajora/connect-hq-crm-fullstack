import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// Roles allowed to bulk-import clients (same as the bulk_import module).
const IMPORT_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "ACCOUNTS"] as const;

// Header aliases seen across the ConnecthqCollectionAndCashExpense.xlsx sheets.
// Matching is case-insensitive and trims/normalises whitespace.
const H = {
  email: ["email ids", "email id", "email", "email address"],
  company: ["customer organisation", "company name", "company", "organisation", "organization", "customer organization"],
  joinDate: ["joining date/or current rate starting date", "joining date", "current rate starting date", "start date"],
  renewalDate: ["rate renewal date", "renewal date", "revision date"],
  seats: ["seat occupied", "occupied seats", "seats occupied", "seats"],
  rate: ["rate per seat", "per seat rate", "rate/seat"],
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Find, within a sheet's rows, the header row and a column-index map for the fields we want.
function findHeaderMap(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const cells = rows[r].map(norm);
    const cols: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(H)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) cols[field] = idx;
    }
    // Require at least email + company to consider this a valid client header row.
    if (cols.email !== undefined && cols.company !== undefined) return { headerIdx: r, cols };
  }
  return null;
}

// Excel serial date → JS Date (xlsx already parses real dates, but some cells are serials).
function toDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && v > 0) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...IMPORT_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to bulk-import clients" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const centerId = String(form?.get("centerId") || "").trim();
  const dryRun = String(form?.get("dryRun") || "") === "1";

  if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!centerId) return NextResponse.json({ error: "Select a center for these clients" }, { status: 400 });

  const center = await prisma.center.findUnique({ where: { id: centerId }, select: { id: true } });
  if (!center) return NextResponse.json({ error: "Center not found" }, { status: 400 });

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await (file as File).arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Could not read the file. Upload a valid .xlsx/.xls." }, { status: 400 });
  }

  // ---- Parse every sheet, best-effort ----
  type Parsed = { email: string; company: string; startDate: Date | null; revisionDate: Date | null; seats: number; rate: number; sheet: string };
  const parsed: Parsed[] = [];
  const skipped: { sheet: string; reason: string; count: number }[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
    const map = findHeaderMap(rows);
    if (!map) { skipped.push({ sheet: sheetName, reason: "no client headers (email+company)", count: 0 }); continue; }

    let sheetSkipped = 0;
    for (let r = map.headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const email = String(row[map.cols.email] ?? "").trim();
      const company = String(row[map.cols.company] ?? "").trim();
      if (!isEmail(email) || !company) { sheetSkipped++; continue; }
      parsed.push({
        email,
        company,
        startDate: map.cols.joinDate !== undefined ? toDate(row[map.cols.joinDate]) : null,
        revisionDate: map.cols.renewalDate !== undefined ? toDate(row[map.cols.renewalDate]) : null,
        seats: map.cols.seats !== undefined ? num(row[map.cols.seats]) : 0,
        rate: map.cols.rate !== undefined ? num(row[map.cols.rate]) : 0,
        sheet: sheetName,
      });
    }
    if (sheetSkipped) skipped.push({ sheet: sheetName, reason: "rows without valid email/company", count: sheetSkipped });
  }

  // Dedupe within the file by email (first occurrence wins).
  const seen = new Set<string>();
  const rowsToImport = parsed.filter((p) => {
    const k = p.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Skip clients that already exist (by email) so re-uploads are safe.
  const existing = new Set(
    (await prisma.client.findMany({ where: { email: { in: rowsToImport.map((p) => p.email) } }, select: { email: true } }))
      .map((c) => c.email.toLowerCase()),
  );
  const toCreate = rowsToImport.filter((p) => !existing.has(p.email.toLowerCase()));

  if (dryRun) {
    return NextResponse.json({
      preview: true,
      totalParsed: parsed.length,
      willCreate: toCreate.length,
      alreadyExists: rowsToImport.length - toCreate.length,
      skippedSheets: skipped,
      sample: toCreate.slice(0, 10).map((p) => ({ company: p.company, email: p.email, seats: p.seats, rate: p.rate, sheet: p.sheet })),
    });
  }

  // ---- Create clients + contracts ----
  let created = 0;
  const errors: { email: string; error: string }[] = [];
  for (const p of toCreate) {
    try {
      const start = p.startDate ?? new Date();
      const revision = p.revisionDate ?? (() => { const d = new Date(start); d.setFullYear(d.getFullYear() + 1); return d; })();
      const monthlyRent = p.rate * (p.seats || 1); // rate per seat × seats
      await prisma.client.create({
        data: {
          companyName: p.company,
          contactName: p.company, // no contact column in the sheet → use company
          email: p.email,
          centerId,
          startDate: start,
          occupiedSeats: p.seats,
          totalCabinSeats: p.seats,
          contract: {
            create: { startDate: start, monthlyRent, securityDeposit: 0, incrementPct: 5, revisionDate: revision },
          },
        },
      });
      created++;
    } catch (e) {
      errors.push({ email: p.email, error: e instanceof Error ? e.message : "create failed" });
    }
  }

  await logAction({ userId: u.id, action: "CLIENTS_BULK_IMPORTED", targetType: "Client", meta: { created, centerId, source: "xlsx" } });

  return NextResponse.json({
    created,
    alreadyExists: rowsToImport.length - toCreate.length,
    totalParsed: parsed.length,
    errors,
    skippedSheets: skipped,
  });
}
