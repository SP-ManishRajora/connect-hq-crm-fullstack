import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, centerScope,
} from "@/lib/housekeeping/route-helpers";

// GET /api/housekeeping/devices?userId=&revoked=1
// Lists registered inspection devices with their owner and recent activity.
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || undefined;
    const revokedOnly = searchParams.get("revoked") === "1";
    const scope = centerScope(u);

    const rows = await prisma.deviceRegistration.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(revokedOnly ? { revokedAt: { not: null } } : {}),
        // A centre-scoped admin only sees devices belonging to their own staff.
        ...(scope ? { user: { centerId: scope } } : {}),
      },
      orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
      take: 300,
      include: {
        user: {
          select: {
            id: true, name: true, email: true, role: true,
            center: { select: { name: true } },
          },
        },
      },
    });

    // Annotate with how much each device has actually been used, so an admin
    // revoking one can see what it touched.
    const withUse = await Promise.all(
      rows.map(async (d) => ({
        ...d,
        visitCount: await prisma.inspectionVisit.count({
          where: { userId: d.userId, deviceId: d.deviceId },
        }),
      })),
    );

    return NextResponse.json(withUse);
  } catch (e) {
    return handleError(e);
  }
}
