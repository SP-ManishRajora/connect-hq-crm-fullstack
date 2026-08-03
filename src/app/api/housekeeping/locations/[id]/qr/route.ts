import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  handleError,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

// Opaque random code — deliberately carries no centre/area information, so a
// photographed QR reveals nothing and only a server lookup can resolve it.
function newQrCode(): string {
  return randomBytes(12).toString("base64url");
}

// POST /api/housekeeping/locations/[id]/qr — mint or rotate.
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

    const current = await prisma.locationQrCode.findFirst({
      where: { locationId: loc.id, active: true },
      orderBy: { version: "desc" },
    });

    const row = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.locationQrCode.update({
          where: { id: current.id },
          data: { active: false, rotatedAt: new Date() },
        });
      }
      return tx.locationQrCode.create({
        data: {
          locationId: loc.id,
          code: newQrCode(),
          version: (current?.version ?? 0) + 1,
        },
      });
    });

    await logAction({
      userId: u.id,
      action: current ? "HK_QR_ROTATED" : "HK_QR_CREATED",
      targetType: "InspectionLocation",
      targetId: loc.id,
      meta: { locationName: loc.name, version: row.version },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
