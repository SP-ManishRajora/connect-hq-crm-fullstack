import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageCenter } from "@/lib/center-access";

/**
 * POST body: { name, capacity, qty, photos?: string[] }
 *   - Creates `qty` cabins of the same name+capacity (suffixed " 1", " 2"...)
 *   - Auto-creates `capacity` seats per cabin.
 *   - Validates that total existing + new seats <= center.totalSeats.
 * GET — list all cabins for this center.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const b = await req.json();
  const name = String(b.name || "Cabin").trim();
  const capacity = Number(b.capacity);
  const qty = Number(b.qty);
  if (!capacity || capacity < 1) return NextResponse.json({ error: "Invalid capacity" }, { status: 400 });
  if (!qty || qty < 1) return NextResponse.json({ error: "Invalid qty" }, { status: 400 });

  const center = await prisma.center.findUnique({ where: { id: params.id }, include: { seats: true } });
  if (!center) return NextResponse.json({ error: "Center not found" }, { status: 404 });

  // Optional floor: if provided, it must belong to this center.
  const floorId = b.floorId ? String(b.floorId) : null;
  if (floorId) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId }, select: { centerId: true } });
    if (!floor || floor.centerId !== params.id) {
      return NextResponse.json({ error: "Floor does not belong to this center" }, { status: 400 });
    }
  }

  const existingSeats = center.seats.length;
  const newSeats = capacity * qty;
  if (existingSeats + newSeats > center.totalSeats) {
    return NextResponse.json({
      error: `Would create ${newSeats} new seats. Existing ${existingSeats} + new ${newSeats} = ${existingSeats + newSeats} > totalSeats ${center.totalSeats}.`,
    }, { status: 400 });
  }

  const photosJson = Array.isArray(b.photos) && b.photos.length ? JSON.stringify(b.photos) : null;
  let seatCounter = existingSeats + 1;
  const created: any[] = [];
  for (let i = 1; i <= qty; i++) {
    const cabin = await prisma.cabin.create({
      data: { centerId: params.id, floorId, name: `${name} ${i}`, capacity, photos: photosJson },
    });
    for (let j = 1; j <= capacity; j++) {
      await prisma.seat.create({
        data: { centerId: params.id, cabinId: cabin.id, number: `S${seatCounter++}`, zone: cabin.name },
      });
    }
    created.push(cabin);
  }
  return NextResponse.json({ created: created.length, cabins: created });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cabins = await prisma.cabin.findMany({ where: { centerId: params.id }, include: { seats: true } });
  return NextResponse.json(cabins);
}
