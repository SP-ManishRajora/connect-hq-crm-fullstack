// Dashboard aggregates. Kept in the service layer so the page component stays
// presentational and the same numbers can back the API, digests and reports.

import { prisma } from "@/lib/db";
import { rankEfficiency } from "./efficiency";

export type CentreStat = {
  centerId: string;
  centre: string;
  areas: number;
  inspectedToday: number;
  compliancePct: number;
  openIssues: number;
  criticalIssues: number;
  overdueIssues: number;
  genDiscrepancies: number;
  generatorsRunning: number;
};

export type ManagementStats = {
  facilityScore: number | null;
  totals: {
    centres: number; areas: number; openIssues: number; criticalIssues: number;
    overdueIssues: number; genDiscrepancies: number; openAlerts: number;
    inspectionsToday: number; expectedToday: number;
  };
  centres: CentreStat[];
  topStaff: { name: string; score: number; closed: number }[];
  recentAlerts: {
    id: string; title: string; severity: string; alertType: string;
    createdAt: Date; centre: string; status: string;
  }[];
  trend: { date: string; inspections: number; issuesRaised: number; issuesClosed: number }[];
  avgResolutionHours: number | null;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getManagementStats(scopeCenterId?: string | null): Promise<ManagementStats> {
  const today = startOfToday();
  const centreWhere = scopeCenterId ? { id: scopeCenterId } : { active: true };

  const centres = await prisma.center.findMany({
    where: centreWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = centres.map((c) => c.id);
  const inScope = { centerId: { in: ids } };

  const [
    openIssues, criticalIssues, overdueIssues, genDiscrepancies, openAlerts,
  ] = await Promise.all([
    prisma.hkIssue.count({ where: { ...inScope, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    prisma.hkIssue.count({ where: { ...inScope, severity: "CRITICAL", status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    prisma.hkIssue.count({ where: { ...inScope, dueAt: { lt: new Date() }, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    prisma.generatorDiscrepancy.count({ where: { ...inScope, resolvedAt: null } }),
    prisma.hkAlert.count({ where: { ...inScope, status: "NEW" } }),
  ]);

  // Per-centre rollup.
  const centreStats: CentreStat[] = [];
  for (const c of centres) {
    const [areas, locs, cOpen, cCritical, cOverdue, cGen] = await Promise.all([
      prisma.inspectionLocation.count({ where: { centerId: c.id, deletedAt: null, active: true } }),
      prisma.inspectionLocation.findMany({
        where: { centerId: c.id, deletedAt: null, active: true },
        select: { id: true, frequencyPerDay: true },
      }),
      prisma.hkIssue.count({ where: { centerId: c.id, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
      prisma.hkIssue.count({ where: { centerId: c.id, severity: "CRITICAL", status: { notIn: ["CLOSED", "CANCELLED"] } } }),
      prisma.hkIssue.count({ where: { centerId: c.id, dueAt: { lt: new Date() }, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
      prisma.generatorDiscrepancy.count({ where: { centerId: c.id, resolvedAt: null } }),
    ]);

    const inspectedToday = await prisma.inspectionVisit.count({
      where: { scannedAt: { gte: today }, status: "SUBMITTED", location: { centerId: c.id } },
    });
    const expected = locs.reduce((s, l) => s + l.frequencyPerDay, 0);

    // Running generators — a generator is running when its latest event is ON.
    const gens = await prisma.generator.findMany({
      where: { centerId: c.id, deletedAt: null, active: true },
      select: { id: true },
    });
    let running = 0;
    for (const g of gens) {
      const latest = await prisma.generatorEvent.findFirst({
        where: { generatorId: g.id },
        orderBy: { atServer: "desc" },
        select: { type: true },
      });
      if (latest?.type === "ON") running++;
    }

    centreStats.push({
      centerId: c.id, centre: c.name, areas,
      inspectedToday,
      compliancePct: expected > 0 ? Math.min(100, Math.round((inspectedToday / expected) * 100)) : 0,
      openIssues: cOpen, criticalIssues: cCritical, overdueIssues: cOverdue,
      genDiscrepancies: cGen, generatorsRunning: running,
    });
  }

  const totalAreas = centreStats.reduce((s, c) => s + c.areas, 0);
  const inspectionsToday = centreStats.reduce((s, c) => s + c.inspectedToday, 0);
  const expectedToday = centreStats.length
    ? centreStats.reduce((s, c) => s + (c.compliancePct > 0 ? Math.round((c.inspectedToday / c.compliancePct) * 100) : c.areas), 0)
    : 0;

  // Facility score: compliance, less penalties for open criticals and overdue work.
  const avgCompliance = centreStats.length
    ? centreStats.reduce((s, c) => s + c.compliancePct, 0) / centreStats.length
    : null;
  const facilityScore =
    avgCompliance == null
      ? null
      : Math.max(0, Math.round(avgCompliance - criticalIssues * 5 - overdueIssues * 2 - genDiscrepancies * 3));

  // 14-day trend.
  const since = new Date(today.getTime() - 13 * 86400_000);
  const [visits, raised, closed] = await Promise.all([
    prisma.inspectionVisit.findMany({
      where: { scannedAt: { gte: since }, status: "SUBMITTED", location: { centerId: { in: ids } } },
      select: { scannedAt: true },
    }),
    prisma.hkIssue.findMany({ where: { ...inScope, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.hkIssue.findMany({ where: { ...inScope, closedAt: { gte: since } }, select: { closedAt: true } }),
  ]);

  const bucket = (rows: { d: Date }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.d.toISOString().slice(0, 10);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const vB = bucket(visits.map((v) => ({ d: v.scannedAt })));
  const rB = bucket(raised.map((r) => ({ d: r.createdAt })));
  const cB = bucket(closed.map((c) => ({ d: c.closedAt! })));

  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000);
    const k = d.toISOString().slice(0, 10);
    trend.push({
      date: k.slice(5),
      inspections: vB.get(k) ?? 0,
      issuesRaised: rB.get(k) ?? 0,
      issuesClosed: cB.get(k) ?? 0,
    });
  }

  // Average resolution time over the last 30 days.
  const recentClosed = await prisma.hkIssue.findMany({
    where: { ...inScope, status: "CLOSED", closedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    select: { createdAt: true, closedAt: true },
  });
  const avgResolutionHours = recentClosed.length
    ? Math.round(
        (recentClosed.reduce((s, i) => s + (i.closedAt!.getTime() - i.createdAt.getTime()), 0) /
          recentClosed.length /
          3600_000) * 10,
      ) / 10
    : null;

  const ranked = await rankEfficiency(new Date(Date.now() - 30 * 86400_000), new Date(), scopeCenterId);

  const alerts = await prisma.hkAlert.findMany({
    where: { ...inScope },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { center: { select: { name: true } } },
  });

  return {
    facilityScore,
    totals: {
      centres: centres.length, areas: totalAreas,
      openIssues, criticalIssues, overdueIssues, genDiscrepancies, openAlerts,
      inspectionsToday, expectedToday,
    },
    centres: centreStats,
    topStaff: ranked.slice(0, 5).map((r) => ({ name: r.userName, score: r.score, closed: r.issuesClosed })),
    recentAlerts: alerts.map((a) => ({
      id: a.id, title: a.title, severity: a.severity, alertType: a.alertType,
      createdAt: a.createdAt, centre: a.center.name, status: a.status,
    })),
    trend,
    avgResolutionHours,
  };
}
