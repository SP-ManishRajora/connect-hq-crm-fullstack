// Phase-3 backfill: turn current active-client occupancy into Allocation rows, routed THROUGH
// the allocate service so they get the same validation + OccupancyHistory + audit event as any
// real allocation (clean provenance). Idempotent: skips seat-spaces that already have an
// ACTIVE allocation.
//
// Each active Client with a cabin + occupiedSeats > 0 → allocate that many of the cabin's
// bridged seat-Spaces (those currently marked occupied) to the client, under its Contract if any.
//
// Usage:  npx tsx prisma/backfill-allocations.ts

import { prisma } from "../src/lib/db";
import { allocateSpaces } from "../src/lib/occupancy/service";
import type { SessionUser } from "../src/lib/auth";

async function main() {
  // System actor for audit attribution.
  const admin = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "OWNER"] } } });
  if (!admin) { console.log("No ADMIN/OWNER user found; aborting."); return; }
  const actor: SessionUser = { id: admin.id, email: admin.email, name: admin.name, role: admin.role, centerId: admin.centerId };

  const clients = await prisma.client.findMany({
    where: { active: true, cabinId: { not: null }, occupiedSeats: { gt: 0 } },
    select: { id: true, companyName: true, cabinId: true, occupiedSeats: true, contract: { select: { id: true, startDate: true, endDate: true } } },
  });

  let allocated = 0, skipped = 0, clientsDone = 0;
  for (const c of clients) {
    // Bridged seat-Spaces for this client's cabin that are currently occupied and not yet allocated.
    const seatSpaces = await prisma.space.findMany({
      // seat-spaces bridge via seatId; match those whose underlying Seat is in this client's cabin
      where: { seat: { cabinId: c.cabinId! }, deletedAt: null },
      select: { id: true, status: true, allocations: { where: { status: "ACTIVE", deletedAt: null }, select: { id: true } } },
      orderBy: { code: "asc" },
    });

    // Take up to occupiedSeats spaces that have no active allocation yet.
    const toAllocate = seatSpaces.filter((s) => s.allocations.length === 0).slice(0, c.occupiedSeats);
    if (toAllocate.length === 0) { skipped++; continue; }

    // Spaces must be AVAILABLE/RESERVED for the service; flip any OCCUPIED-by-legacy back to
    // AVAILABLE just-in-time so the service's invariant holds (the allocation then re-occupies them).
    await prisma.space.updateMany({
      where: { id: { in: toAllocate.map((s) => s.id) }, status: "OCCUPIED" },
      data: { status: "AVAILABLE" },
    });

    await allocateSpaces(
      {
        clientId: c.id,
        contractId: c.contract?.id ?? null,
        items: toAllocate.map((s) => ({ spaceId: s.id, seatsTaken: 1 })),
        startDate: c.contract?.startDate ?? new Date(),
        endDate: c.contract?.endDate ?? null,
      },
      actor,
    );
    allocated += toAllocate.length;
    clientsDone++;
  }

  const activeAllocs = await prisma.allocation.count({ where: { status: "ACTIVE", deletedAt: null } });
  console.log(`Backfill complete. Clients processed: ${clientsDone}, spaces allocated: ${allocated}, clients skipped (already done): ${skipped}.`);
  console.log(`Total ACTIVE allocations now: ${activeAllocs}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
