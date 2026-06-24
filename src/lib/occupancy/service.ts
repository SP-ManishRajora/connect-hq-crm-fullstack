import { prisma } from "@/lib/db";
import { Prisma, SpaceStatus, AllocationStatus } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { HttpError } from "./types";
import { emit } from "./events";
import type { AllocateDTO, ReleaseDTO, ReserveDTO, TransferDTO } from "./validators";

type Tx = Prisma.TransactionClient;

// Statuses from which a space may be taken into a new allocation.
const ALLOCATABLE: SpaceStatus[] = [SpaceStatus.AVAILABLE, SpaceStatus.RESERVED];

async function getAllocatableSpace(tx: Tx, spaceId: string, seatsTaken: number) {
  const space = await tx.space.findUnique({ where: { id: spaceId } });
  if (!space || space.deletedAt) throw new HttpError(404, `Space ${spaceId} not found`);
  if (!ALLOCATABLE.includes(space.status)) throw new HttpError(409, `Space "${space.code}" is ${space.status}, not available`);
  if (seatsTaken > space.capacity) throw new HttpError(400, `seatsTaken (${seatsTaken}) exceeds capacity (${space.capacity}) of "${space.code}"`);
  return space;
}

// ---- Allocate one or more spaces to a client (bulk-capable, single transaction) ----
export async function allocateSpaces(input: AllocateDTO, actor: SessionUser) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!client) throw new HttpError(404, "Client not found");
  if (input.contractId) {
    const c = await prisma.contract.findUnique({ where: { id: input.contractId }, select: { id: true } });
    if (!c) throw new HttpError(404, "Contract not found");
  }

  const created = await prisma.$transaction(async (tx) => {
    const allocs = [];
    for (const item of input.items) {
      const space = await getAllocatableSpace(tx, item.spaceId, item.seatsTaken);
      const alloc = await tx.allocation.create({
        data: {
          spaceId: space.id,
          clientId: input.clientId,
          contractId: input.contractId ?? null,
          seatsTaken: item.seatsTaken,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          status: AllocationStatus.ACTIVE,
          allocatedById: actor.id,
        },
      });
      await tx.space.update({ where: { id: space.id }, data: { status: SpaceStatus.OCCUPIED } });
      await tx.occupancyHistory.create({
        data: {
          allocationId: alloc.id,
          spaceId: space.id,
          clientId: input.clientId,
          event: "ALLOCATED",
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          actorId: actor.id,
          meta: JSON.stringify({ seatsTaken: item.seatsTaken, contractId: input.contractId ?? null }),
        },
      });
      allocs.push(alloc);
    }
    return allocs;
  });

  await emit("OccupancyAllocated", {
    actorId: actor.id,
    targetType: "Client",
    targetId: input.clientId,
    meta: { allocationIds: created.map((a) => a.id), spaceIds: created.map((a) => a.spaceId) },
  });
  return created;
}

// ---- Release an active allocation; frees the space ----
export async function releaseAllocation(allocationId: string, input: ReleaseDTO, actor: SessionUser) {
  const vacatedAt = input.vacatedAt ?? new Date();

  const released = await prisma.$transaction(async (tx) => {
    const alloc = await tx.allocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.deletedAt) throw new HttpError(404, "Allocation not found");
    if (alloc.status !== AllocationStatus.ACTIVE) throw new HttpError(409, `Allocation is ${alloc.status}, not ACTIVE`);

    const newStatus = input.reason === "EXPIRED" ? AllocationStatus.EXPIRED : AllocationStatus.TERMINATED;
    const updated = await tx.allocation.update({
      where: { id: allocationId },
      data: { status: newStatus, endDate: alloc.endDate ?? vacatedAt },
    });
    await tx.space.update({ where: { id: alloc.spaceId }, data: { status: SpaceStatus.AVAILABLE } });
    await tx.occupancyHistory.create({
      data: {
        allocationId: alloc.id,
        spaceId: alloc.spaceId,
        clientId: alloc.clientId,
        event: input.reason === "EXPIRED" ? "EXPIRED" : "RELEASED",
        vacatedAt,
        actorId: actor.id,
      },
    });
    return updated;
  });

  await emit("OccupancyReleased", {
    actorId: actor.id,
    targetType: "Allocation",
    targetId: released.id,
    meta: { spaceId: released.spaceId, reason: input.reason },
  });
  return released;
}

// ---- Reserve a space temporarily ----
export async function reserveSpace(input: ReserveDTO, actor: SessionUser) {
  if (input.clientId) {
    const c = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
    if (!c) throw new HttpError(404, "Client not found");
  }

  const reservation = await prisma.$transaction(async (tx) => {
    const space = await tx.space.findUnique({ where: { id: input.spaceId } });
    if (!space || space.deletedAt) throw new HttpError(404, "Space not found");
    if (space.status !== SpaceStatus.AVAILABLE) throw new HttpError(409, `Space "${space.code}" is ${space.status}, cannot reserve`);

    const res = await tx.reservation.create({
      data: {
        spaceId: space.id,
        reservedById: actor.id,
        clientId: input.clientId ?? null,
        expiresAt: input.expiresAt,
        notes: input.notes ?? null,
      },
    });
    await tx.space.update({ where: { id: space.id }, data: { status: SpaceStatus.RESERVED } });
    await tx.occupancyHistory.create({
      data: {
        spaceId: space.id,
        clientId: input.clientId ?? null,
        event: "RESERVED",
        endDate: input.expiresAt,
        actorId: actor.id,
      },
    });
    return res;
  });

  await emit("ReservationCreated", {
    actorId: actor.id,
    targetType: "Reservation",
    targetId: reservation.id,
    meta: { spaceId: reservation.spaceId, expiresAt: reservation.expiresAt },
  });
  return reservation;
}

// ---- Transfer spaces from their current client to another (bulk-capable) ----
export async function transferSpaces(input: TransferDTO, actor: SessionUser) {
  const startDate = input.startDate ?? new Date();
  // Group id so a bulk transfer's rows can be reported together.
  const batchId = `xfer_${actor.id}_${startDate.getTime()}`;

  const result = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const item of input.items) {
      const toClient = await tx.client.findUnique({ where: { id: item.toClientId }, select: { id: true } });
      if (!toClient) throw new HttpError(404, `Target client ${item.toClientId} not found`);

      const space = await tx.space.findUnique({ where: { id: item.spaceId } });
      if (!space || space.deletedAt) throw new HttpError(404, `Space ${item.spaceId} not found`);

      // End the current active allocation (if any) and capture the previous client.
      const current = await tx.allocation.findFirst({
        where: { spaceId: space.id, status: AllocationStatus.ACTIVE, deletedAt: null },
      });
      const prevClientId = current?.clientId ?? null;
      if (current) {
        await tx.allocation.update({ where: { id: current.id }, data: { status: AllocationStatus.TRANSFERRED, endDate: startDate } });
      }

      // Create the new allocation for the target client.
      const next = await tx.allocation.create({
        data: {
          spaceId: space.id,
          clientId: item.toClientId,
          contractId: item.toContractId ?? null,
          seatsTaken: item.seatsTaken,
          startDate,
          endDate: input.endDate ?? null,
          status: AllocationStatus.ACTIVE,
          allocatedById: actor.id,
        },
      });
      await tx.space.update({ where: { id: space.id }, data: { status: SpaceStatus.OCCUPIED } });

      const transfer = await tx.spaceTransfer.create({
        data: {
          spaceId: space.id,
          fromClientId: prevClientId,
          toClientId: item.toClientId,
          fromAllocationId: current?.id ?? null,
          toAllocationId: next.id,
          batchId,
          transferredById: actor.id,
          reason: input.reason ?? null,
        },
      });
      await tx.occupancyHistory.create({
        data: {
          allocationId: next.id,
          spaceId: space.id,
          clientId: item.toClientId,
          prevClientId,
          event: "TRANSFERRED",
          startDate,
          endDate: input.endDate ?? null,
          actorId: actor.id,
          meta: JSON.stringify({ batchId, fromAllocationId: current?.id ?? null }),
        },
      });
      out.push({ transfer, allocation: next });
    }
    return out;
  });

  await emit("OccupancyTransferred", {
    actorId: actor.id,
    targetType: "SpaceTransfer",
    meta: { batchId, count: result.length, spaceIds: result.map((r) => r.allocation.spaceId) },
  });
  return { batchId, transfers: result };
}
