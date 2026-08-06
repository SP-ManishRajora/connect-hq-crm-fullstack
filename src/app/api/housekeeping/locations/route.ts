import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
  centerScope,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { createLocationSchema } from "@/lib/housekeeping/validators";

// GET /api/housekeeping/locations?centerId=…&includeInactive=1
export async function GET(req: NextRequest) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get("centerId") || undefined;
    const includeInactive = searchParams.get("includeInactive") === "1";

    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.inspectionLocation.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { active: true }),
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
      },
      orderBy: [{ centerId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        center: { select: { id: true, name: true } },
        floor: { select: { id: true, name: true } },
        qrCodes: {
          where: { active: true },
          select: { id: true, code: true, version: true },
          take: 1,
        },
        // Both halves of the area's single sticker — setup shows when one is missing.
        clientQrCodes: {
          where: { active: true },
          select: { id: true, code: true, version: true },
          take: 1,
        },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/housekeeping/locations
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(createLocationSchema, await req.json());
    assertCenterAllowed(u, body.centerId);

    const last = await prisma.inspectionLocation.findFirst({
      where: { centerId: body.centerId, deletedAt: null },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const row = await prisma.inspectionLocation.create({
      data: {
        centerId: body.centerId,
        floorId: body.floorId ?? null,
        name: body.name,
        category: body.category,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        geofenceRadiusM: body.geofenceRadiusM,
        requiredPhotoCount: body.requiredPhotoCount,
        requiredAngles: body.requiredAngles ? JSON.stringify(body.requiredAngles) : null,
        checklist: body.checklist ? JSON.stringify(body.checklist) : null,
        minDwellSeconds: body.minDwellSeconds,
        frequencyPerDay: body.frequencyPerDay,
        priority: body.priority,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_LOCATION_CREATED",
      targetType: "InspectionLocation",
      targetId: row.id,
      meta: { name: row.name, centerId: row.centerId, category: row.category },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
