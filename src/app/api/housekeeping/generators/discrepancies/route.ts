import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, centerScope, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

// GET /api/housekeeping/generators/discrepancies?centerId=&open=1&generatorId=
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get("centerId") || undefined;
    const generatorId = searchParams.get("generatorId") || undefined;
    const openOnly = searchParams.get("open") !== "0";

    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.generatorDiscrepancy.findMany({
      where: {
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
        ...(generatorId ? { generatorId } : {}),
        ...(openOnly ? { resolvedAt: null } : {}),
      },
      orderBy: [{ detectedAt: "desc" }],
      take: 200,
      include: {
        generator: { select: { id: true, name: true, code: true } },
        reading: {
          select: { at: true, fuelReading: true, hourMeter: true, user: { select: { name: true } } },
        },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}
