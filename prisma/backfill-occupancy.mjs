// One-time, idempotent backfill for the Occupancy module (Phase 1).
//
// Creates a Space row for every existing Seat, Cabin, and MeetingRoom (bridged via *Id FKs),
// then sets Space.status from the legacy Seat.occupied flag. Re-runnable: it skips any entity
// that already has a bridged Space, so running twice does nothing the second time.
//
// Usage:  node prisma/backfill-occupancy.mjs

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  let createdSeats = 0, createdCabins = 0, createdRooms = 0;

  // ---- Seats → DEDICATED_SEAT spaces ----
  const seats = await prisma.seat.findMany({
    select: { id: true, centerId: true, number: true, zone: true, occupied: true },
  });
  const bridgedSeatIds = new Set(
    (await prisma.space.findMany({ where: { seatId: { not: null } }, select: { seatId: true } }))
      .map((s) => s.seatId),
  );
  for (const seat of seats) {
    if (bridgedSeatIds.has(seat.id)) continue;
    await prisma.space.create({
      data: {
        code: `SEAT-${seat.number}`,
        name: `Seat ${seat.number}`,
        type: "DEDICATED_SEAT",
        capacity: 1,
        status: seat.occupied ? "OCCUPIED" : "AVAILABLE",
        centerId: seat.centerId,
        seatId: seat.id,
      },
    });
    createdSeats++;
  }

  // ---- Cabins → CABIN spaces ----
  const cabins = await prisma.cabin.findMany({ select: { id: true, centerId: true, name: true, capacity: true } });
  const bridgedCabinIds = new Set(
    (await prisma.space.findMany({ where: { cabinId: { not: null } }, select: { cabinId: true } }))
      .map((s) => s.cabinId),
  );
  for (const cabin of cabins) {
    if (bridgedCabinIds.has(cabin.id)) continue;
    await prisma.space.create({
      data: {
        code: `CABIN-${cabin.name}`.replace(/\s+/g, "-"),
        name: cabin.name,
        type: "CABIN",
        capacity: cabin.capacity || 1,
        status: "AVAILABLE", // cabin occupancy is derived from its seats; leave neutral
        centerId: cabin.centerId,
        cabinId: cabin.id,
      },
    });
    createdCabins++;
  }

  // ---- Meeting rooms → MEETING_ROOM spaces ----
  const rooms = await prisma.meetingRoom.findMany({ select: { id: true, centerId: true, name: true, capacity: true } });
  const bridgedRoomIds = new Set(
    (await prisma.space.findMany({ where: { meetingRoomId: { not: null } }, select: { meetingRoomId: true } }))
      .map((s) => s.meetingRoomId),
  );
  for (const room of rooms) {
    if (bridgedRoomIds.has(room.id)) continue;
    await prisma.space.create({
      data: {
        code: `ROOM-${room.name}`.replace(/\s+/g, "-"),
        name: room.name,
        type: "MEETING_ROOM",
        capacity: room.capacity || 1,
        status: "AVAILABLE",
        centerId: room.centerId,
        meetingRoomId: room.id,
      },
    });
    createdRooms++;
  }

  const total = await prisma.space.count();
  console.log(`Backfill complete. Created: ${createdSeats} seat-spaces, ${createdCabins} cabin-spaces, ${createdRooms} room-spaces.`);
  console.log(`Total Space rows now: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
