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
  const notes = b.notes ? String(b.notes).trim() || null : null;
  if (!capacity || capacity < 1) return NextResponse.json({ error: "Invalid capacity" }, { status: 400 });
  // qty = "how many cabins to create". 0 is allowed and creates ONE placeholder cabin
  // (no seats) that carries the note explaining why it's a zero-qty entry.
  if (!Number.isInteger(qty) || qty < 0) return NextResponse.json({ error: "Invalid qty" }, { status: 400 });
  if (qty === 0 && !notes) return NextResponse.json({ error: "Add a note explaining the zero-quantity cabin." }, { status: 400 });

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

  const photosJson = Array.isArray(b.photos) && b.photos.length ? JSON.stringify(b.photos) : null;
  const created: any[] = [];

  // Zero-quantity: create a single placeholder cabin (0 seats) that holds the note.
  if (qty === 0) {
    const cabin = await prisma.cabin.create({
      data: { centerId: params.id, floorId, name, capacity, photos: photosJson, notes },
    });
    created.push(cabin);
    return NextResponse.json({ created: created.length, cabins: created });
  }

  const existingSeats = center.seats.length;
  // Over-capacity is allowed: a center can hold more placed seats than its nominal
  // totalSeats (the "seats left" figure in the UI simply goes negative).

  let seatCounter = existingSeats + 1;
  for (let i = 1; i <= qty; i++) {
    const cabin = await prisma.cabin.create({
      data: { centerId: params.id, floorId, name: `${name} ${i}`, capacity, photos: photosJson, notes },
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

/**
 * PATCH body: { cabinId, name?, floorId?, notes?, photos?: string[], capacity? }
 *   - Edits a cabin's metadata.
 *   - Changing `capacity` grows/shrinks the cabin's auto-created seats:
 *       grow  → adds new S-numbered seats (respecting center.totalSeats)
 *       shrink→ removes free seats from the end (never below the occupied count)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const cabinId = String(b?.cabinId || "").trim();
  if (!cabinId) return NextResponse.json({ error: "cabinId required" }, { status: 400 });

  const cabin = await prisma.cabin.findUnique({ where: { id: cabinId }, include: { seats: true } });
  if (!cabin || cabin.centerId !== params.id) return NextResponse.json({ error: "Cabin not found" }, { status: 404 });

  // Validate optional floor belongs to this center.
  let floorId = cabin.floorId;
  if (b.floorId !== undefined) {
    floorId = b.floorId ? String(b.floorId) : null;
    if (floorId) {
      const floor = await prisma.floor.findUnique({ where: { id: floorId }, select: { centerId: true } });
      if (!floor || floor.centerId !== params.id) {
        return NextResponse.json({ error: "Floor does not belong to this center" }, { status: 400 });
      }
    }
  }

  const data: Record<string, unknown> = { floorId };
  if (b.name !== undefined) {
    const name = String(b.name || "").trim();
    if (!name) return NextResponse.json({ error: "Cabin name cannot be empty." }, { status: 400 });
    data.name = name;
  }
  if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).trim() || null : null;
  if (b.photos !== undefined) data.photos = Array.isArray(b.photos) && b.photos.length ? JSON.stringify(b.photos) : null;

  // Capacity change → reconcile seats.
  if (b.capacity !== undefined) {
    const newCap = Number(b.capacity);
    if (!Number.isInteger(newCap) || newCap < 1) return NextResponse.json({ error: "Invalid capacity" }, { status: 400 });
    const oldCap = cabin.seats.length;

    if (newCap > oldCap) {
      // Grow. Over-capacity is allowed here, same as POST: a center can hold more placed
      // seats than its nominal totalSeats (the UI's "seats left" simply goes negative).
      // The client warns before sending; the server does not block.
      const center = await prisma.center.findUnique({ where: { id: params.id } });
      if (!center) return NextResponse.json({ error: "Center not found" }, { status: 404 });
      const adding = newCap - oldCap;
      // Number from the highest existing S-number, not the seat count: shrinks and cabin
      // deletes leave gaps, and [centerId, number] is unique — counting would collide.
      const existing = await prisma.seat.findMany({ where: { centerId: params.id }, select: { number: true } });
      let counter = existing.reduce((max, s) => {
        const n = /^S(\d+)$/.exec(s.number);
        return n ? Math.max(max, Number(n[1])) : max;
      }, 0) + 1;
      for (let i = 0; i < adding; i++) {
        await prisma.seat.create({ data: { centerId: params.id, cabinId, number: `S${counter++}`, zone: b.name ? String(b.name) : cabin.name } });
      }
    } else if (newCap < oldCap) {
      // Shrink: remove FREE seats from the end. Never remove occupied/assigned seats.
      const occupiedCount = cabin.seats.filter((s) => s.occupied || s.assignedClientId).length;
      if (newCap < occupiedCount) {
        return NextResponse.json({ error: `Cannot shrink below ${occupiedCount} occupied seat(s). Release them first.` }, { status: 400 });
      }
      const removable = cabin.seats
        .filter((s) => !s.occupied && !s.assignedClientId)
        .sort((a, z) => (a.number < z.number ? 1 : -1)); // highest-numbered first
      const toRemove = removable.slice(0, oldCap - newCap).map((s) => s.id);
      if (toRemove.length) await prisma.seat.deleteMany({ where: { id: { in: toRemove } } });
    }
    data.capacity = newCap;
  }

  const updated = await prisma.cabin.update({ where: { id: cabinId }, data });
  // Keep seat.zone aligned with the cabin name, or a rename leaves existing seats
  // labelled with the old zone while newly-grown ones use the new one.
  if (data.name && data.name !== cabin.name) {
    await prisma.seat.updateMany({ where: { cabinId }, data: { zone: String(data.name) } });
  }
  return NextResponse.json(updated);
}

/**
 * DELETE body: { cabinId }
 *   - Removes the cabin and its auto-created seats.
 *   - Refuses only on real occupancy: occupied/assigned seats, or live
 *     allocations/reservations against the cabin's bridged Spaces (those carry a
 *     required spaceId, so they'd block the delete at the DB level).
 *   - Client / Proposal / Space links are all nullable FKs, so they're simply
 *     detached; Spaces are soft-deleted the way the occupancy module expects.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const cabinId = String(b?.cabinId || "").trim();
  if (!cabinId) return NextResponse.json({ error: "cabinId required" }, { status: 400 });

  const cabin = await prisma.cabin.findUnique({ where: { id: cabinId }, include: { seats: true } });
  if (!cabin || cabin.centerId !== params.id) return NextResponse.json({ error: "Cabin not found" }, { status: 404 });

  const inUse = cabin.seats.filter((s) => s.occupied || s.assignedClientId).length;
  if (inUse) {
    return NextResponse.json({ error: `Cabin has ${inUse} occupied/assigned seat(s). Clear the assignment first.` }, { status: 400 });
  }

  // Spaces bridged to this cabin or to its seats — only the live (non-soft-deleted) ones matter.
  const seatIds = cabin.seats.map((s) => s.id);
  const spaces = await prisma.space.findMany({
    where: { deletedAt: null, OR: [{ cabinId }, ...(seatIds.length ? [{ seatId: { in: seatIds } }] : [])] },
    select: { id: true },
  });
  const spaceIds = spaces.map((s) => s.id);

  if (spaceIds.length) {
    const [allocs, resvs] = await Promise.all([
      prisma.allocation.count({ where: { spaceId: { in: spaceIds }, status: "ACTIVE" } }),
      prisma.reservation.count({ where: { spaceId: { in: spaceIds } } }),
    ]);
    const blockers: string[] = [];
    if (allocs) blockers.push(`${allocs} active allocation(s)`);
    if (resvs) blockers.push(`${resvs} reservation(s)`);
    if (blockers.length) {
      return NextResponse.json({ error: `Cabin has ${blockers.join(" and ")} in the occupancy module. Release them first.` }, { status: 400 });
    }
  }

  const now = new Date();
  await prisma.$transaction([
    // Detach nullable references, soft-delete bridged spaces, then drop seats + cabin.
    prisma.client.updateMany({ where: { cabinId }, data: { cabinId: null } }),
    prisma.proposal.updateMany({ where: { cabinId }, data: { cabinId: null } }),
    ...(spaceIds.length
      ? [prisma.space.updateMany({ where: { id: { in: spaceIds } }, data: { deletedAt: now, cabinId: null, seatId: null } })]
      : []),
    prisma.space.updateMany({ where: { cabinId }, data: { cabinId: null } }),
    ...(seatIds.length ? [prisma.space.updateMany({ where: { seatId: { in: seatIds } }, data: { seatId: null } })] : []),
    prisma.seat.deleteMany({ where: { cabinId } }),
    prisma.cabin.delete({ where: { id: cabinId } }),
  ]);
  return NextResponse.json({ ok: true });
}
