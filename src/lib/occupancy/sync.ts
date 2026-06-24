import { prisma } from "@/lib/db";
import { SpaceStatus } from "@prisma/client";

// Phase-1 bridge: keep the new Space.status aligned with the legacy Seat.occupied flag so the
// occupancy module reflects reality without rewriting the 12 places that still own Seat/Client
// occupancy. Call these from the existing write points (cabin assign, client occupancy, bookings).
//
// Manual states (MAINTENANCE / BLOCKED / RESERVED) are NEVER overwritten by the seat sync — only
// the AVAILABLE↔OCCUPIED pair tracks the legacy flag. Later, when the seatmap reads from Space
// directly, this whole module can be deleted (see docs/occupancy-module plan).

// Only the AVAILABLE↔OCCUPIED pair tracks the legacy seat flag; manual states
// (MAINTENANCE / BLOCKED / RESERVED) are never overwritten by the seat sync.
const SEAT_DRIVEN: SpaceStatus[] = [SpaceStatus.AVAILABLE, SpaceStatus.OCCUPIED];

// Sync a single Seat's bridged Space rows to its occupied flag.
export async function syncSeatStatus(seatId: string) {
  const seat = await prisma.seat.findUnique({ where: { id: seatId }, select: { id: true, occupied: true } });
  if (!seat) return;
  const target = seat.occupied ? SpaceStatus.OCCUPIED : SpaceStatus.AVAILABLE;
  await prisma.space.updateMany({
    where: { seatId: seat.id, deletedAt: null, status: { in: SEAT_DRIVEN } },
    data: { status: target },
  });
}

// Sync every seat-bridged Space in a center (used after bulk occupancy changes / backfill).
export async function syncCenterSeatStatuses(centerId: string) {
  const seats = await prisma.seat.findMany({ where: { centerId }, select: { id: true, occupied: true } });
  await prisma.$transaction(
    seats.map((s) =>
      prisma.space.updateMany({
        where: { seatId: s.id, deletedAt: null, status: { in: SEAT_DRIVEN } },
        data: { status: s.occupied ? SpaceStatus.OCCUPIED : SpaceStatus.AVAILABLE },
      }),
    ),
  );
}
