import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";
import { parseLeadWorkbook, dedupeKey } from "@/lib/leadImport";
import { OLD_DATA_SOURCE, OLD_LEADS_SOURCE } from "@/lib/oldLeads";

// Roles allowed to bulk-import old leads.
const IMPORT_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES"] as const;

// Upload the old lead workbook. With dryRun=1 nothing is written: the response
// says what would be created, so the sheet can be checked before committing.
// Re-uploading the same file is safe — rows already imported are skipped.
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...IMPORT_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to import leads" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const dryRun = String(form?.get("dryRun") || "") === "1";
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await (file as File).arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "Could not read the file. Upload a valid .xlsx, .xls or .csv." }, { status: 400 });
  }

  const centers = await prisma.center.findMany({ select: { id: true, name: true } });
  const { rows, skippedSheets, blankRows } = parseLeadWorkbook(wb, centers);

  // Within the file: the same enquiry copied into several sheets counts once.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = dedupeKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Against the CRM: anything already imported from an earlier upload, including
  // leads since followed up and moved to the main tab.
  const existing = await prisma.lead.findMany({
    where: { OR: [{ source: { startsWith: OLD_DATA_SOURCE } }, { source: { startsWith: OLD_LEADS_SOURCE } }] },
    select: { phone: true, email: true, name: true, source: true },
  });
  const already = new Set(existing.map(dedupeKey));
  const toCreate = unique.filter((r) => !already.has(dedupeKey(r)));

  const summary = {
    totalRows: rows.length,
    duplicatesInFile: rows.length - unique.length,
    alreadyImported: unique.length - toCreate.length,
    willCreate: toCreate.length,
    blankRows,
    skippedSheets,
    noPhone: toCreate.filter((r) => !r.phone).length,
    noCenter: toCreate.filter((r) => !r.centerId).length,
    dateProblems: toCreate
      .filter((r) => r.dateProblem)
      .slice(0, 50)
      .map((r) => ({ sheet: r.sheet, row: r.rowNo, name: r.name, date: r.dateProblem })),
    dateProblemCount: toCreate.filter((r) => r.dateProblem).length,
    byStatus: toCreate.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {}),
  };

  if (dryRun) {
    return NextResponse.json({
      preview: true,
      ...summary,
      sample: toCreate.slice(0, 15).map((r) => ({
        sheet: r.sheet, row: r.rowNo, name: r.name, phone: r.phone, source: r.source,
        status: r.status, seats: r.seatsNeeded, workspaceType: r.workspaceType,
        center: centers.find((c) => c.id === r.centerId)?.name ?? null,
      })),
    });
  }

  let created = 0;
  const errors: { sheet: string; row: number; name: string; error: string }[] = [];
  const now = new Date();
  // Small parallel batches: ~2,000 rows would take a minute one at a time.
  for (let i = 0; i < toCreate.length; i += 25) {
    const batch = toCreate.slice(i, i + 25);
    const results = await Promise.allSettled(
      batch.map((r) => {
        const at = r.createdAt ?? now;
        return prisma.lead.create({
          data: {
            source: r.source,
            name: r.name,
            phone: r.phone,
            email: r.email,
            company: r.company,
            seatsNeeded: r.seatsNeeded,
            workspaceType: r.workspaceType,
            budget: r.budget,
            area: r.area,
            centerId: r.centerId,
            sourceType: r.sourceType,
            status: r.status,
            notes: r.notes,
            // Dated as the enquiry, not the upload, so reports for this month
            // are not flooded with two years of history.
            createdAt: at,
            comments: r.remarks.length
              ? { create: r.remarks.map((body) => ({ body, channel: "IMPORT", authorId: u.id, createdAt: at })) }
              : undefined,
          },
        });
      }),
    );
    results.forEach((res, j) => {
      if (res.status === "fulfilled") created++;
      else {
        const r = batch[j];
        errors.push({ sheet: r.sheet, row: r.rowNo, name: r.name, error: res.reason instanceof Error ? res.reason.message : "create failed" });
      }
    });
  }

  await logAction({
    userId: u.id,
    action: "LEADS_BULK_IMPORTED",
    targetType: "Lead",
    meta: { created, failed: errors.length, alreadyImported: summary.alreadyImported, file: (file as File).name },
  });

  return NextResponse.json({ ...summary, created, errors: errors.slice(0, 100), errorCount: errors.length });
}
