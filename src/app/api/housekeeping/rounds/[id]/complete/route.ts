import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { requireModule, isResponse, handleError } from "@/lib/housekeeping/route-helpers";
import { haversineM } from "@/lib/housekeeping/geo";

// POST /api/housekeeping/rounds/[id]/complete
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const round = await prisma.inspectionRound.findUnique({
      where: { id: params.id },
      include: {
        visits: {
          orderBy: { sequence: "asc" },
          select: { id: true, lat: true, lng: true, status: true },
        },
      },
    });
    if (!round) throw Object.assign(new Error("Round not found"), { __status: 404 });
    if (round.userId !== u.id && u.role !== "ADMIN" && u.role !== "OWNER") {
      throw Object.assign(new Error("This is not your round"), { __status: 403 });
    }
    if (round.status !== "IN_PROGRESS") {
      throw Object.assign(new Error("Round is already closed"), { __status: 400 });
    }

    // Distance travelled — sum of consecutive visit positions.
    let distanceM = 0;
    for (let i = 1; i < round.visits.length; i++) {
      const a = round.visits[i - 1];
      const b = round.visits[i];
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        distanceM += haversineM(a.lat, a.lng, b.lat, b.lng);
      }
    }

    const submitted = round.visits.filter((v) => v.status === "SUBMITTED").length;

    // How many active locations exist at this centre — the denominator for
    // "locations missed".
    const totalLocations = await prisma.inspectionLocation.count({
      where: { centerId: round.centerId, active: true, deletedAt: null },
    });

    const row = await prisma.inspectionRound.update({
      where: { id: round.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        distanceM: Math.round(distanceM),
        score: totalLocations > 0 ? Math.round((submitted / totalLocations) * 100) : null,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_ROUND_COMPLETED",
      targetType: "InspectionRound",
      targetId: row.id,
      meta: {
        submitted,
        totalLocations,
        missed: Math.max(0, totalLocations - submitted),
        distanceM: row.distanceM,
      },
    });

    return NextResponse.json({
      ...row,
      submitted,
      totalLocations,
      missed: Math.max(0, totalLocations - submitted),
    });
  } catch (e) {
    return handleError(e);
  }
}
