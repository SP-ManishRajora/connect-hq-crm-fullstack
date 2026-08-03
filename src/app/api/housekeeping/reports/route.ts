import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  requireModule, isResponse, handleError, centerScope, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import {
  buildReport, isReportType, toCSV, toPrintableHTML,
  REPORT_TYPES, REPORT_LABELS,
} from "@/lib/housekeeping/reports";

export const runtime = "nodejs";

// GET /api/housekeeping/reports?type=&format=json|csv|xlsx|pdf&centerId=&from=&to=…
//
// One endpoint for all 18 reports: the ReportTable shape means format handling
// is written once rather than per report.
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_reports");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "";

    // No type → the menu of available reports.
    if (!type) {
      return NextResponse.json(
        REPORT_TYPES.map((t) => ({ type: t, label: REPORT_LABELS[t] })),
      );
    }
    if (!isReportType(type)) {
      throw Object.assign(new Error(`Unknown report type "${type}"`), { __status: 400 });
    }

    const centerId = searchParams.get("centerId") || undefined;
    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);
    const effectiveCenter = centerId ?? scope ?? null;

    const parseDate = (v: string | null) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const table = await buildReport(type, {
      centerId: effectiveCenter,
      from: parseDate(searchParams.get("from")),
      to: parseDate(searchParams.get("to")),
      userId: searchParams.get("userId"),
      severity: searchParams.get("severity"),
      category: searchParams.get("category"),
      generatorId: searchParams.get("generatorId"),
    });

    const format = (searchParams.get("format") || "json").toLowerCase();
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      return new NextResponse(toCSV(table), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      // Map rows through the column order so the sheet matches the table.
      const aoa = [
        table.columns.map((c) => c.label),
        ...table.rows.map((r) => table.columns.map((c) => r[c.key] ?? "")),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, table.title.slice(0, 31) || "Report");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        },
      });
    }

    if (format === "pdf" || format === "print") {
      return new NextResponse(toPrintableHTML(table), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return NextResponse.json(table);
  } catch (e) {
    return handleError(e);
  }
}
