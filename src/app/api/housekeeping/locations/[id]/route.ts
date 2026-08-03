import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { updateLocationSchema } from "@/lib/housekeeping/validators";

async function load(id: string) {
  const row = await prisma.inspectionLocation.findFirst({
    where: { id, deletedAt: null },
  });
  if (!row) throw Object.assign(new Error("Location not found"), { __status: 404 });
  return row;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const existing = await load(params.id);
    assertCenterAllowed(u, existing.centerId);

    const body = parseBody(updateLocationSchema, await req.json());

    const row = await prisma.inspectionLocation.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.floorId !== undefined ? { floorId: body.floorId ?? null } : {}),
        ...(body.lat !== undefined ? { lat: body.lat ?? null } : {}),
        ...(body.lng !== undefined ? { lng: body.lng ?? null } : {}),
        ...(body.geofenceRadiusM !== undefined ? { geofenceRadiusM: body.geofenceRadiusM } : {}),
        ...(body.requiredPhotoCount !== undefined ? { requiredPhotoCount: body.requiredPhotoCount } : {}),
        ...(body.requiredAngles !== undefined
          ? { requiredAngles: body.requiredAngles ? JSON.stringify(body.requiredAngles) : null }
          : {}),
        ...(body.checklist !== undefined
          ? { checklist: body.checklist ? JSON.stringify(body.checklist) : null }
          : {}),
        ...(body.minDwellSeconds !== undefined ? { minDwellSeconds: body.minDwellSeconds } : {}),
        ...(body.frequencyPerDay !== undefined ? { frequencyPerDay: body.frequencyPerDay } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    // Audit records the before → after value, per the module's audit rule.
    await logAction({
      userId: u.id,
      action: "HK_LOCATION_UPDATED",
      targetType: "InspectionLocation",
      targetId: row.id,
      meta: {
        before: {
          name: existing.name, lat: existing.lat, lng: existing.lng,
          geofenceRadiusM: existing.geofenceRadiusM, active: existing.active,
        },
        after: {
          name: row.name, lat: row.lat, lng: row.lng,
          geofenceRadiusM: row.geofenceRadiusM, active: row.active,
        },
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}

// Soft delete only — inspection history must never lose its location.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const existing = await load(params.id);
    assertCenterAllowed(u, existing.centerId);

    await prisma.inspectionLocation.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), active: false },
    });
    // Retire its QR codes so an old printout can't keep resolving.
    await prisma.locationQrCode.updateMany({
      where: { locationId: params.id, active: true },
      data: { active: false, rotatedAt: new Date() },
    });

    await logAction({
      userId: u.id,
      action: "HK_LOCATION_DELETED",
      targetType: "InspectionLocation",
      targetId: params.id,
      meta: { name: existing.name, centerId: existing.centerId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
