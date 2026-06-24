import { NextRequest, NextResponse } from "next/server";
import { getOccupancyKpis } from "@/lib/occupancy/dashboard";
import { requireUser, isResponse, handleError, VIEW_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/dashboard?centerId= — KPI snapshot (optionally scoped to one center).
export async function GET(req: NextRequest) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const centerId = req.nextUrl.searchParams.get("centerId");
    const kpis = await getOccupancyKpis(centerId);
    return NextResponse.json(kpis);
  } catch (e) {
    return handleError(e);
  }
}
