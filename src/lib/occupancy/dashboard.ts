import { prisma } from "@/lib/db";
import { Prisma, SpaceStatus } from "@prisma/client";

// Read-only KPI aggregation for the Occupancy dashboard. Optionally scoped to one center.
// All counts exclude soft-deleted spaces.

export type OccupancyKpis = {
  centerId: string | null;
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  occupancyPct: number;
  vacancyPct: number;
  reserved: number;
  available: number;
  occupied: number;
  upcomingVacancies: { allocationId: string; spaceCode: string; clientName: string | null; endDate: string }[];
  expiringAgreements: { contractId: string; clientName: string; endDate: string }[];
  monthlyRevenue: number;       // sum of monthlyRent across distinct active-allocation contracts
  revenuePerSeat: number;       // monthlyRevenue / occupied
  overdueClients: number;       // distinct clients with an unpaid invoice
};

const HORIZON_DAYS = 30; // "upcoming"/"expiring" window

export async function getOccupancyKpis(centerId?: string | null): Promise<OccupancyKpis> {
  const spaceWhere: Prisma.SpaceWhereInput = { deletedAt: null, ...(centerId ? { centerId } : {}) };
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);

  const [total, byStatusRaw, byTypeRaw, activeAllocs, expiringContracts] = await Promise.all([
    prisma.space.count({ where: spaceWhere }),
    prisma.space.groupBy({ by: ["status"], where: spaceWhere, _count: true }),
    prisma.space.groupBy({ by: ["type"], where: spaceWhere, _count: true }),
    prisma.allocation.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        ...(centerId ? { space: { centerId } } : {}),
      },
      select: {
        id: true,
        endDate: true,
        contractId: true,
        contract: { select: { monthlyRent: true } },
        space: { select: { code: true } },
        client: { select: { id: true, companyName: true } },
      },
    }),
    prisma.contract.findMany({
      where: {
        endDate: { not: null, gte: now, lte: horizon },
        ...(centerId ? { client: { centerId } } : {}),
      },
      select: { id: true, endDate: true, client: { select: { companyName: true } } },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const s of Object.values(SpaceStatus)) byStatus[s] = 0;
  byStatusRaw.forEach((r) => { byStatus[r.status] = r._count; });
  const byType: Record<string, number> = {};
  byTypeRaw.forEach((r) => { byType[r.type] = r._count; });

  const occupied = byStatus[SpaceStatus.OCCUPIED] ?? 0;
  const available = byStatus[SpaceStatus.AVAILABLE] ?? 0;
  const reserved = byStatus[SpaceStatus.RESERVED] ?? 0;
  const occupancyPct = total ? Math.round((occupied / total) * 100) : 0;
  const vacancyPct = total ? Math.round((available / total) * 100) : 0;

  // Upcoming vacancies = active allocations ending within the horizon.
  const upcomingVacancies = activeAllocs
    .filter((a) => a.endDate && a.endDate >= now && a.endDate <= horizon)
    .sort((a, b) => (a.endDate!.getTime() - b.endDate!.getTime()))
    .slice(0, 20)
    .map((a) => ({ allocationId: a.id, spaceCode: a.space.code, clientName: a.client?.companyName ?? null, endDate: a.endDate!.toISOString() }));

  const expiringAgreements = expiringContracts
    .sort((a, b) => a.endDate!.getTime() - b.endDate!.getTime())
    .map((c) => ({ contractId: c.id, clientName: c.client?.companyName ?? "—", endDate: c.endDate!.toISOString() }));

  // Monthly revenue: sum monthlyRent once per distinct contract that has an active allocation.
  const seenContracts = new Set<string>();
  let monthlyRevenue = 0;
  for (const a of activeAllocs) {
    if (a.contractId && a.contract && !seenContracts.has(a.contractId)) {
      seenContracts.add(a.contractId);
      monthlyRevenue += a.contract.monthlyRent;
    }
  }
  const revenuePerSeat = occupied ? Math.round(monthlyRevenue / occupied) : 0;

  // Overdue: distinct clients with at least one unpaid invoice.
  const overdueGroups = await prisma.clientInvoice.groupBy({
    by: ["clientId"],
    where: { status: { not: "PAID" }, ...(centerId ? { centerId } : {}) },
  });
  const overdueClients = overdueGroups.length;

  return {
    centerId: centerId ?? null,
    total, byStatus, byType,
    occupancyPct, vacancyPct,
    reserved, available, occupied,
    upcomingVacancies, expiringAgreements,
    monthlyRevenue, revenuePerSeat, overdueClients,
  };
}
