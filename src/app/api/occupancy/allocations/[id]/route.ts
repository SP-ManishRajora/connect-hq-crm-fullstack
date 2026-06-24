import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AllocationStatus } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { releaseSchema } from "@/lib/occupancy/validators";
import { releaseAllocation } from "@/lib/occupancy/service";
import { requireUser, isResponse, parseBody, handleError, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// Only the end date / seat count of an ACTIVE allocation may be modified in place; status
// changes go through the release/transfer services so history + space status stay correct.
const updateAllocationSchema = z
  .object({
    endDate: z.coerce.date().nullable().optional(),
    seatsTaken: z.number().int().positive().optional(),
  })
  .refine((d) => d.endDate !== undefined || d.seatsTaken !== undefined, { message: "Nothing to update" });

// PUT /api/occupancy/allocations/[id] — extend / modify an active allocation.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const data = parseBody(updateAllocationSchema, await req.json().catch(() => ({})));
    const alloc = await prisma.allocation.findUnique({ where: { id: params.id } });
    if (!alloc || alloc.deletedAt) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (alloc.status !== AllocationStatus.ACTIVE) return NextResponse.json({ error: `Allocation is ${alloc.status}, not ACTIVE` }, { status: 409 });
    if (data.endDate && data.endDate <= alloc.startDate) return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    if (data.seatsTaken) {
      const space = await prisma.space.findUnique({ where: { id: alloc.spaceId }, select: { capacity: true } });
      if (space && data.seatsTaken > space.capacity) return NextResponse.json({ error: "seatsTaken exceeds capacity" }, { status: 400 });
    }

    const updated = await prisma.allocation.update({
      where: { id: params.id },
      data: {
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.seatsTaken !== undefined ? { seatsTaken: data.seatsTaken } : {}),
      },
    });
    await logAction({ userId: u.id, action: "ALLOCATION_UPDATED", targetType: "Allocation", targetId: params.id, meta: { ...data } });
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/occupancy/allocations/[id] — release the allocation (frees the space).
// Body may carry { reason: "TERMINATED"|"EXPIRED", vacatedAt }.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const dto = parseBody(releaseSchema, await req.json().catch(() => ({})));
    const released = await releaseAllocation(params.id, dto, u);
    return NextResponse.json(released);
  } catch (e) {
    return handleError(e);
  }
}
