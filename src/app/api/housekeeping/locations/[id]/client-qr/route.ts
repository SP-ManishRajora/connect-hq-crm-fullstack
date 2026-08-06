import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  handleError,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { newQrCode } from "@/lib/housekeeping/qr-resolve";

// POST /api/housekeeping/locations/[id]/client-qr — mint or rotate the CLIENT code.
//
// Mirrors the staff route next door. Until now client codes existed only via
// `npm run db:seed:cr`, which meant an area added after the seed ran had no way
// to get one and a compromised sticker had no way to be replaced.
//
// Rotation deactivates the old row rather than mutating it, so a stale printout
// is identifiable as retired instead of silently accepted.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const loc = await prisma.inspectionLocation.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!loc) throw Object.assign(new Error("Location not found"), { __status: 404 });
    assertCenterAllowed(u, loc.centerId);

    const current = await prisma.clientQrCode.findFirst({
      where: { locationId: loc.id, active: true },
      orderBy: { version: "desc" },
    });

    const row = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.clientQrCode.update({
          where: { id: current.id },
          data: { active: false, rotatedAt: new Date() },
        });
      }
      return tx.clientQrCode.create({
        data: {
          locationId: loc.id,
          code: newQrCode(),
          version: (current?.version ?? 0) + 1,
        },
      });
    });

    await logAction({
      userId: u.id,
      action: current ? "HK_CLIENT_QR_ROTATED" : "HK_CLIENT_QR_CREATED",
      targetType: "InspectionLocation",
      targetId: loc.id,
      meta: { locationName: loc.name, version: row.version },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
