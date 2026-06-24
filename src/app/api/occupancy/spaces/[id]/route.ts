import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SpaceStatus } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { requireUser, isResponse, parseBody, handleError, VIEW_ROLES, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/spaces/[id] — full detail incl. active allocation, reservations, history.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const space = await prisma.space.findUnique({
      where: { id: params.id },
      include: {
        center: { select: { name: true } },
        floor: { select: { name: true } },
        zone: { select: { name: true } },
        allocations: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: { client: { select: { id: true, companyName: true } }, contract: { select: { id: true, endDate: true } } },
        },
        reservations: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!space || space.deletedAt) return NextResponse.json({ error: "not found" }, { status: 404 });
    const history = await prisma.occupancyHistory.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ ...space, history });
  } catch (e) {
    return handleError(e);
  }
}

// Only fields safe to edit directly. Status edits are limited to admin/maintenance states
// here; AVAILABLE↔OCCUPIED↔RESERVED are owned by the allocate/reserve/release services.
const updateSpaceSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  floorId: z.string().min(1).nullable().optional(),
  zoneId: z.string().min(1).nullable().optional(),
  gridX: z.number().int().nullable().optional(),
  gridY: z.number().int().nullable().optional(),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "BLOCKED"]).optional(),
});

// PUT /api/occupancy/spaces/[id] — edit metadata / set MAINTENANCE|BLOCKED|AVAILABLE.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const data = parseBody(updateSpaceSchema, await req.json().catch(() => ({})));
    const space = await prisma.space.findUnique({ where: { id: params.id } });
    if (!space || space.deletedAt) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Guard: don't flip an actively-occupied/reserved space into MAINTENANCE/BLOCKED via metadata edit;
    // release/cancel it through the proper flow first.
    const occupiedOrReserved: SpaceStatus[] = [SpaceStatus.OCCUPIED, SpaceStatus.RESERVED];
    if (data.status && data.status !== "AVAILABLE" && occupiedOrReserved.includes(space.status)) {
      return NextResponse.json({ error: `Space is ${space.status}; release/cancel it before setting ${data.status}.` }, { status: 409 });
    }

    const updated = await prisma.space.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.floorId !== undefined ? { floorId: data.floorId } : {}),
        ...(data.zoneId !== undefined ? { zoneId: data.zoneId } : {}),
        ...(data.gridX !== undefined ? { gridX: data.gridX } : {}),
        ...(data.gridY !== undefined ? { gridY: data.gridY } : {}),
        ...(data.status !== undefined ? { status: data.status as SpaceStatus } : {}),
      },
    });
    if (data.status) {
      await logAction({ userId: u.id, action: "SPACE_STATUS_CHANGED", targetType: "Space", targetId: space.id, meta: { from: space.status, to: data.status } });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/occupancy/spaces/[id] — soft delete (never hard-delete; history is preserved).
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const space = await prisma.space.findUnique({ where: { id: params.id } });
    if (!space || space.deletedAt) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (space.status === SpaceStatus.OCCUPIED) {
      return NextResponse.json({ error: "Cannot delete an occupied space. Release it first." }, { status: 409 });
    }
    await prisma.space.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await logAction({ userId: u.id, action: "SPACE_DELETED", targetType: "Space", targetId: space.id, meta: { code: space.code } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
