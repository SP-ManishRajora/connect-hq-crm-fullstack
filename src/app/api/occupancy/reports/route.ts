import { NextRequest, NextResponse } from "next/server";
import { buildReport, isReportType, toCSV, toPrintableHTML } from "@/lib/occupancy/reports";
import { requireUser, isResponse, handleError } from "@/lib/occupancy/route-helpers";
import { MODULE_ACCESS } from "@/lib/rbac";

// Single source of truth: roles allowed by the occupancy_reports RBAC module.
const REPORT_ROLES = MODULE_ACCESS.occupancy_reports;

// GET /api/occupancy/reports?type=occupancy&centerId=&format=json|csv|pdf
export async function GET(req: NextRequest) {
  const u = await requireUser(REPORT_ROLES);
  if (isResponse(u)) return u;
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type") || "occupancy";
    if (!isReportType(type)) return NextResponse.json({ error: `Unknown report type "${type}"` }, { status: 400 });
    const centerId = sp.get("centerId");
    const format = (sp.get("format") || "json").toLowerCase();

    const table = await buildReport(type, centerId);
    const fileBase = `${type}-report`;

    if (format === "csv") {
      return new NextResponse(toCSV(table), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        },
      });
    }
    if (format === "pdf" || format === "html") {
      // HTML the browser prints to PDF (matches the app's proposal-PDF approach).
      return new NextResponse(toPrintableHTML(table), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json(table);
  } catch (e) {
    return handleError(e);
  }
}
