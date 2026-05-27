import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageCenter } from "@/lib/center-access";

/**
 * POST body: { cabinId, clientId, occupiedSeats }
 * Assigns a Client to a Cabin and updates seat colours:
 *   first `occupiedSeats` seats → occupied (green)
 *   remainder of cabin           → partialOccupancy (orange)
 * Also updates the Client record (cabinId, occupiedSeats, totalCabinSeats).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const { cabinId, clientId, occupiedSeats } = await req.json();
  if (!cabinId || !clientId || occupiedSeats === undefined) return NextResponse.json({ error: "cabinId, clientId, occupiedSeats required" }, { status: 400 });

  const cabin = await prisma.cabin.findUnique({ where: { id: cabinId } });
  if (!cabin || cabin.centerId !== params.id) return NextResponse.json({ error: "Cabin not in this center" }, { status: 400 });
  const occ = Math.min(Math.max(0, Number(occupiedSeats)), cabin.capacity);

  const seats = await prisma.seat.findMany({ where: { cabinId }, orderBy: { number: "asc" } });
  for (let i = 0; i < seats.length; i++) {
    await prisma.seat.update({
      where: { id: seats[i].id },
      data: {
        occupied: i < occ,
        partialOccupancy: i >= occ,
        assignedClientId: clientId,
      },
    });
  }
  await prisma.client.update({
    where: { id: clientId },
    data: { cabinId, centerId: params.id, occupiedSeats: occ, totalCabinSeats: cabin.capacity },
  });
  return NextResponse.json({ ok: true, occupied: occ, total: cabin.capacity });
}

// POST /api/centers/[id]/assign-cabin (unassign) — DELETE-like
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const { cabinId } = await req.json();
  if (!cabinId) return NextResponse.json({ error: "cabinId required" }, { status: 400 });
  const seats = await prisma.seat.findMany({ where: { cabinId } });
  const clientIds = Array.from(new Set(seats.map((s) => s.assignedClientId).filter(Boolean) as string[]));
  for (const s of seats) {
    await prisma.seat.update({ where: { id: s.id }, data: { occupied: false, partialOccupancy: false, assignedClientId: null } });
  }
  for (const cid of clientIds) {
    await prisma.client.update({ where: { id: cid }, data: { cabinId: null, occupiedSeats: 0, totalCabinSeats: 0 } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, cleared: seats.length });
}
