// Housekeeping efficiency scoring (brief §9).
//
// Scored ONLY from data the system actually records today — corrective-action
// outcomes and inspection results. The brief also asks for normalisation by
// shift length, area size and centre occupancy; that needs HkStaff rosters
// which do not exist yet (deferred: D-06 / D-19). Rather than invent those
// inputs, the score reports exactly which factors it could measure, so a low
// score is always explainable.
//
// Guiding rule from the brief: "Do not score staff solely on the number of
// reported issues." Volume is never a factor here — only how well work was
// handled once assigned.

import { prisma } from "@/lib/db";
import { getEfficiencyConfig, type EfficiencyConfig } from "./settings";

export type FactorScore = {
  key: string;
  label: string;
  weight: number;      // 0–1
  score: number;       // 0–100
  detail: string;
  measurable: boolean; // false → weight redistributed, reason recorded
};

export type EfficiencyResult = {
  userId: string;
  userName: string;
  score: number;
  factors: FactorScore[];
  reasons: string[];   // why the score is below 100
  issuesClosed: number;
  issuesLate: number;
  reworkCount: number;
  sampleSize: number;
};

// Computes one person's score over a period.
export async function computeEfficiency(
  userId: string,
  from: Date,
  to: Date,
  cfg?: EfficiencyConfig,
): Promise<EfficiencyResult> {
  const conf = cfg ?? (await getEfficiencyConfig());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });

  // Every issue assigned to this person that reached a terminal or verifiable
  // state within the window.
  const issues = await prisma.hkIssue.findMany({
    where: {
      assigneeId: userId,
      OR: [
        { closedAt: { gte: from, lte: to } },
        { updatedAt: { gte: from, lte: to }, status: { in: ["AWAITING_VERIFICATION", "REJECTED", "IN_PROGRESS"] } },
      ],
    },
    include: {
      actions: { orderBy: { createdAt: "asc" } },
      reinspections: true,
    },
  });

  const closed = issues.filter((i) => i.status === "CLOSED");
  const late = closed.filter((i) => i.dueAt && i.closedAt && i.closedAt > i.dueAt);
  const rework = issues.filter((i) => i.reinspections.some((r) => r.verdict === "FAIL"));

  const factors: FactorScore[] = [];
  const reasons: string[] = [];

  // --- 1. Rectification within SLA ----------------------------------------
  if (closed.length > 0) {
    const onTime = closed.length - late.length;
    const s = (onTime / closed.length) * 100;
    factors.push({
      key: "sla", label: "Rectification within due time", weight: conf.weights.sla,
      score: s, measurable: true,
      detail: `${onTime} of ${closed.length} closed within the due time`,
    });
    if (late.length) reasons.push(`${late.length} issue(s) closed after the due time`);
  } else {
    factors.push({
      key: "sla", label: "Rectification within due time", weight: conf.weights.sla,
      score: 0, measurable: false, detail: "No issues closed in this period",
    });
  }

  // --- 2. First-time-right (no rework) ------------------------------------
  if (issues.length > 0) {
    const s = ((issues.length - rework.length) / issues.length) * 100;
    factors.push({
      key: "quality", label: "Work accepted first time", weight: conf.weights.quality,
      score: s, measurable: true,
      detail: `${issues.length - rework.length} of ${issues.length} accepted without rework`,
    });
    if (rework.length) reasons.push(`${rework.length} item(s) sent back for rework`);
  } else {
    factors.push({
      key: "quality", label: "Work accepted first time", weight: conf.weights.quality,
      score: 0, measurable: false, detail: "No assigned work in this period",
    });
  }

  // --- 3. Completion rate (assigned work actually finished) ---------------
  if (issues.length > 0) {
    const s = (closed.length / issues.length) * 100;
    factors.push({
      key: "completion", label: "Assigned work completed", weight: conf.weights.completion,
      score: s, measurable: true,
      detail: `${closed.length} of ${issues.length} assigned issues closed`,
    });
    const open = issues.length - closed.length;
    if (open > 0) reasons.push(`${open} assigned issue(s) still open`);
  } else {
    factors.push({
      key: "completion", label: "Assigned work completed", weight: conf.weights.completion,
      score: 0, measurable: false, detail: "No assigned work in this period",
    });
  }

  // --- 4. Evidence discipline (after-photo supplied) -----------------------
  const withAction = issues.filter((i) => i.actions.length > 0);
  if (withAction.length > 0) {
    const withPhoto = withAction.filter((i) => i.actions.some((a) => a.afterPhotoId));
    const s = (withPhoto.length / withAction.length) * 100;
    factors.push({
      key: "evidence", label: "After-photograph supplied", weight: conf.weights.evidence,
      score: s, measurable: true,
      detail: `${withPhoto.length} of ${withAction.length} submissions had photographic evidence`,
    });
    if (withPhoto.length < withAction.length) {
      reasons.push(`${withAction.length - withPhoto.length} submission(s) without an after photograph`);
    }
  } else {
    factors.push({
      key: "evidence", label: "After-photograph supplied", weight: conf.weights.evidence,
      score: 0, measurable: false, detail: "No work submitted in this period",
    });
  }

  // --- 5. Severity handling (criticals resolved promptly) ------------------
  const criticals = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
  if (criticals.length > 0) {
    const handled = criticals.filter((i) => i.status === "CLOSED" && !(i.dueAt && i.closedAt && i.closedAt > i.dueAt));
    const s = (handled.length / criticals.length) * 100;
    factors.push({
      key: "severity", label: "High-severity items handled on time", weight: conf.weights.severity,
      score: s, measurable: true,
      detail: `${handled.length} of ${criticals.length} critical/high items closed within time`,
    });
    if (handled.length < criticals.length) {
      reasons.push(`${criticals.length - handled.length} critical/high item(s) not resolved on time`);
    }
  } else {
    factors.push({
      key: "severity", label: "High-severity items handled on time", weight: conf.weights.severity,
      score: 0, measurable: false, detail: "No critical or high items in this period",
    });
  }

  // Redistribute the weight of unmeasurable factors across measurable ones, so
  // a quiet period does not read as poor performance.
  const measurable = factors.filter((f) => f.measurable);
  const totalMeasurableWeight = measurable.reduce((s, f) => s + f.weight, 0);

  let score = 0;
  if (totalMeasurableWeight > 0) {
    for (const f of measurable) score += f.score * (f.weight / totalMeasurableWeight);
  }

  if (measurable.length === 0) {
    reasons.push("No measurable activity in this period — score not meaningful");
  }

  return {
    userId,
    userName: user?.name ?? userId,
    score: Math.round(score * 10) / 10,
    factors,
    reasons,
    issuesClosed: closed.length,
    issuesLate: late.length,
    reworkCount: rework.length,
    sampleSize: issues.length,
  };
}

// Scores everyone with housekeeping activity in the window, ranked.
export async function rankEfficiency(
  from: Date,
  to: Date,
  centerId?: string | null,
): Promise<EfficiencyResult[]> {
  const cfg = await getEfficiencyConfig();

  const assignees = await prisma.hkIssue.findMany({
    where: {
      assigneeId: { not: null },
      updatedAt: { gte: from, lte: to },
      ...(centerId ? { centerId } : {}),
    },
    select: { assigneeId: true },
    distinct: ["assigneeId"],
  });

  const out: EfficiencyResult[] = [];
  for (const a of assignees) {
    if (!a.assigneeId) continue;
    out.push(await computeEfficiency(a.assigneeId, from, to, cfg));
  }
  // Rank by score, then by volume handled so ties favour the busier person.
  return out.sort((x, y) => y.score - x.score || y.sampleSize - x.sampleSize);
}

// Persists a computed score so trends survive and manual overrides can be audited.
export async function persistScore(
  r: EfficiencyResult,
  from: Date,
  to: Date,
  centerId?: string | null,
) {
  return prisma.hkEfficiencyScore.upsert({
    where: { userId_periodStart_periodEnd: { userId: r.userId, periodStart: from, periodEnd: to } },
    create: {
      userId: r.userId, centerId: centerId ?? null,
      periodStart: from, periodEnd: to,
      score: r.score, breakdown: JSON.stringify({ factors: r.factors, reasons: r.reasons }),
      issuesClosed: r.issuesClosed, issuesLate: r.issuesLate, reworkCount: r.reworkCount,
    },
    update: {
      score: r.score, breakdown: JSON.stringify({ factors: r.factors, reasons: r.reasons }),
      issuesClosed: r.issuesClosed, issuesLate: r.issuesLate, reworkCount: r.reworkCount,
    },
  });
}
