// Housekeeping reports — all 18 from brief §14.
//
// Each builder returns the same { title, columns, rows } shape used by the
// occupancy module, so CSV / Excel / print-PDF rendering is written once and
// every report gets export for free.
//
// Reports whose data source does not exist yet (AI analysis, AI corrections)
// return an EMPTY table with an explanatory `note` rather than being silently
// absent from the menu — see D-20.

import { prisma } from "@/lib/db";
import { rankEfficiency } from "./efficiency";
import { RULE_LABELS } from "./generator-rules";
import { FLAG_LABELS } from "./types";

export type ReportTable = {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  note?: string;
};

export const REPORT_TYPES = [
  "daily-inspection",      // 1  daily centre inspection
  "area-cleanliness",      // 2  area-wise cleanliness
  "bathroom-inspection",   // 3  bathroom inspections
  "common-area",           // 4  common-area inspections
  "staff-efficiency",      // 5  staff efficiency
  "missed-inspection",     // 6  missed inspections
  "movement",              // 7  inspection movement
  "suspicious-scan",       // 8  suspicious scanning
  "duplicate-image",       // 9  duplicate images
  "action-ageing",         // 10 corrective-action ageing
  "repeat-issue",          // 11 repeat issues
  "generator-runtime",     // 12 generator runtime
  "generator-fuel",        // 13 generator fuel consumption
  "generator-discrepancy", // 14 generator discrepancies
  "diesel-refill",         // 15 diesel refills
  "ai-accuracy",           // 16 AI analysis accuracy      (Phase 5)
  "ai-correction",         // 17 AI corrections            (Phase 5)
  "centre-comparison",     // 18 centre comparison
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  "daily-inspection": "Daily centre inspection",
  "area-cleanliness": "Area-wise cleanliness",
  "bathroom-inspection": "Bathroom inspection",
  "common-area": "Common-area inspection",
  "staff-efficiency": "Staff efficiency",
  "missed-inspection": "Missed inspections",
  "movement": "Inspection movement",
  "suspicious-scan": "Suspicious scanning",
  "duplicate-image": "Duplicate images",
  "action-ageing": "Corrective-action ageing",
  "repeat-issue": "Repeat issues",
  "generator-runtime": "Generator runtime",
  "generator-fuel": "Generator fuel consumption",
  "generator-discrepancy": "Generator discrepancies",
  "diesel-refill": "Diesel refills",
  "ai-accuracy": "AI analysis accuracy",
  "ai-correction": "AI corrections",
  "centre-comparison": "Centre comparison",
};

export function isReportType(x: string): x is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(x);
}

export type ReportFilters = {
  centerId?: string | null;
  from?: Date;
  to?: Date;
  userId?: string | null;
  severity?: string | null;
  category?: string | null;
  generatorId?: string | null;
};

const dt = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") : "";
const num = (n: number | null | undefined, dp = 1) =>
  n == null ? "" : Number(n).toFixed(dp);

export async function buildReport(type: ReportType, f: ReportFilters): Promise<ReportTable> {
  const from = f.from ?? new Date(Date.now() - 30 * 86400_000);
  const to = f.to ?? new Date();
  const centre = f.centerId ? { centerId: f.centerId } : {};
  const title = REPORT_LABELS[type];

  switch (type) {
    // ---------------------------------------------------------------- 1
    case "daily-inspection": {
      const rounds = await prisma.inspectionRound.findMany({
        where: { ...centre, startedAt: { gte: from, lte: to }, ...(f.userId ? { userId: f.userId } : {}) },
        orderBy: { startedAt: "desc" },
        include: {
          center: { select: { name: true } },
          user: { select: { name: true } },
          _count: { select: { visits: true } },
        },
      });
      return {
        title,
        columns: [
          { key: "date", label: "Date" }, { key: "centre", label: "Centre" },
          { key: "user", label: "Inspector" }, { key: "areas", label: "Areas done" },
          { key: "status", label: "Status" }, { key: "score", label: "Completion %" },
          { key: "distance", label: "Distance (m)" },
        ],
        rows: rounds.map((r) => ({
          date: dt(r.startedAt), centre: r.center.name, user: r.user.name,
          areas: r._count.visits, status: r.status,
          score: r.score ?? "", distance: r.distanceM ?? "",
        })),
      };
    }

    // ---------------------------------------------------------------- 2,3,4
    case "area-cleanliness":
    case "bathroom-inspection":
    case "common-area": {
      const categoryFilter =
        type === "bathroom-inspection" ? { category: "BATHROOM" as const }
        : type === "common-area" ? { category: "COMMON_AREA" as const }
        : {};

      const locs = await prisma.inspectionLocation.findMany({
        where: { ...centre, deletedAt: null, ...categoryFilter },
        include: {
          center: { select: { name: true } },
          visits: {
            where: { scannedAt: { gte: from, lte: to } },
            orderBy: { scannedAt: "desc" },
          },
          issues: { where: { createdAt: { gte: from, lte: to } } },
        },
        orderBy: [{ centerId: "asc" }, { sortOrder: "asc" }],
      });

      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "area", label: "Area" },
          { key: "category", label: "Category" }, { key: "inspections", label: "Inspections" },
          { key: "lastInspected", label: "Last inspected" },
          { key: "issues", label: "Issues raised" }, { key: "open", label: "Still open" },
        ],
        rows: locs.map((l) => ({
          centre: l.center.name, area: l.name, category: l.category.replace(/_/g, " "),
          inspections: l.visits.filter((v) => v.status === "SUBMITTED").length,
          lastInspected: dt(l.visits[0]?.scannedAt),
          issues: l.issues.length,
          open: l.issues.filter((i) => !["CLOSED", "CANCELLED"].includes(i.status)).length,
        })),
      };
    }

    // ---------------------------------------------------------------- 5
    case "staff-efficiency": {
      const ranked = await rankEfficiency(from, to, f.centerId);
      return {
        title,
        columns: [
          { key: "rank", label: "#" }, { key: "name", label: "Staff" },
          { key: "score", label: "Score" }, { key: "closed", label: "Closed" },
          { key: "late", label: "Late" }, { key: "rework", label: "Rework" },
          { key: "reasons", label: "Main reasons" },
        ],
        rows: ranked.map((r, i) => ({
          rank: i + 1, name: r.userName, score: r.score,
          closed: r.issuesClosed, late: r.issuesLate, rework: r.reworkCount,
          reasons: r.reasons.slice(0, 2).join("; "),
        })),
        note: "Scored from corrective-action outcomes only. Shift-length, area-size and occupancy normalisation require staff rosters (deferred: D-19).",
      };
    }

    // ---------------------------------------------------------------- 6
    case "missed-inspection": {
      const locs = await prisma.inspectionLocation.findMany({
        where: { ...centre, deletedAt: null, active: true },
        include: {
          center: { select: { name: true } },
          visits: {
            where: { scannedAt: { gte: from, lte: to }, status: "SUBMITTED" },
            orderBy: { scannedAt: "desc" }, take: 1,
          },
        },
        orderBy: [{ centerId: "asc" }, { sortOrder: "asc" }],
      });
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400_000));
      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "area", label: "Area" },
          { key: "expected", label: "Expected" }, { key: "done", label: "Done" },
          { key: "missed", label: "Missed" }, { key: "lastSeen", label: "Last inspected" },
        ],
        rows: locs
          .map((l) => {
            const expected = l.frequencyPerDay * days;
            const done = l.visits.length;
            return {
              centre: l.center.name, area: l.name,
              expected, done, missed: Math.max(0, expected - done),
              lastSeen: dt(l.visits[0]?.scannedAt) || "never",
            };
          })
          .filter((r) => Number(r.missed) > 0),
      };
    }

    // ---------------------------------------------------------------- 7
    case "movement": {
      const rounds = await prisma.inspectionRound.findMany({
        where: { ...centre, startedAt: { gte: from, lte: to } },
        include: {
          center: { select: { name: true } }, user: { select: { name: true } },
          visits: { orderBy: { sequence: "asc" }, include: { location: { select: { name: true } } } },
        },
        orderBy: { startedAt: "desc" },
      });
      return {
        title,
        columns: [
          { key: "date", label: "Date" }, { key: "centre", label: "Centre" },
          { key: "user", label: "Inspector" }, { key: "areas", label: "Areas" },
          { key: "distance", label: "Distance (m)" }, { key: "minutes", label: "Duration (min)" },
          { key: "route", label: "Route" },
        ],
        rows: rounds.map((r) => ({
          date: dt(r.startedAt), centre: r.center.name, user: r.user.name,
          areas: r.visits.length, distance: r.distanceM ?? "",
          minutes: r.completedAt
            ? Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 60000) : "",
          route: r.visits.map((v) => v.location.name).join(" → "),
        })),
      };
    }

    // ---------------------------------------------------------------- 8
    case "suspicious-scan": {
      const visits = await prisma.inspectionVisit.findMany({
        where: { scannedAt: { gte: from, lte: to }, flags: { not: null }, ...(f.centerId ? { location: { centerId: f.centerId } } : {}) },
        include: {
          location: { select: { name: true, center: { select: { name: true } } } },
          user: { select: { name: true } },
        },
        orderBy: { scannedAt: "desc" },
      });
      return {
        title,
        columns: [
          { key: "when", label: "When" }, { key: "centre", label: "Centre" },
          { key: "area", label: "Area" }, { key: "user", label: "User" },
          { key: "distance", label: "Distance (m)" }, { key: "dwell", label: "Dwell (s)" },
          { key: "flags", label: "Flags" },
        ],
        rows: visits.map((v) => {
          let flags: string[] = [];
          try { flags = JSON.parse(v.flags ?? "[]"); } catch { /* keep empty */ }
          return {
            when: dt(v.scannedAt), centre: v.location.center.name, area: v.location.name,
            user: v.user.name, distance: v.distanceM != null ? Math.round(v.distanceM) : "",
            dwell: v.dwellSeconds ?? "",
            flags: flags.map((x) => FLAG_LABELS[x] ?? x).join("; "),
          };
        }),
      };
    }

    // ---------------------------------------------------------------- 9
    case "duplicate-image": {
      const photos = await prisma.inspectionPhoto.findMany({
        where: {
          createdAt: { gte: from, lte: to }, flags: { contains: "DUPLICATE_PHOTO" },
          ...(f.centerId ? { location: { centerId: f.centerId } } : {}),
        },
        include: {
          location: { select: { name: true, center: { select: { name: true } } } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return {
        title,
        columns: [
          { key: "when", label: "When" }, { key: "centre", label: "Centre" },
          { key: "area", label: "Area" }, { key: "user", label: "Uploaded by" },
          { key: "angle", label: "Angle" }, { key: "hash", label: "SHA-256 (short)" },
        ],
        rows: photos.map((p) => ({
          when: dt(p.createdAt), centre: p.location.center.name, area: p.location.name,
          user: p.user.name, angle: p.angle, hash: p.sha256.slice(0, 16),
        })),
      };
    }

    // ---------------------------------------------------------------- 10
    case "action-ageing": {
      const issues = await prisma.hkIssue.findMany({
        where: {
          ...centre, status: { notIn: ["CLOSED", "CANCELLED"] },
          ...(f.severity ? { severity: f.severity as any } : {}),
          ...(f.category ? { category: f.category } : {}),
        },
        include: {
          center: { select: { name: true } }, location: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const now = Date.now();
      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "area", label: "Area" },
          { key: "title", label: "Issue" }, { key: "severity", label: "Severity" },
          { key: "status", label: "Status" }, { key: "assignee", label: "Assignee" },
          { key: "ageDays", label: "Age (days)" }, { key: "overdueH", label: "Overdue (h)" },
        ],
        rows: issues.map((i) => ({
          centre: i.center.name, area: i.location?.name ?? "—", title: i.title,
          severity: i.severity, status: i.status, assignee: i.assignee?.name ?? "unassigned",
          ageDays: Math.floor((now - i.createdAt.getTime()) / 86400_000),
          overdueH: i.dueAt && i.dueAt.getTime() < now
            ? Math.floor((now - i.dueAt.getTime()) / 3600_000) : 0,
        })),
      };
    }

    // ---------------------------------------------------------------- 11
    case "repeat-issue": {
      const issues = await prisma.hkIssue.findMany({
        where: { ...centre, createdAt: { gte: from, lte: to } },
        include: {
          center: { select: { name: true } }, location: { select: { name: true } },
        },
      });
      // Group by area + category: the same fault recurring in the same place.
      const key = (i: (typeof issues)[number]) =>
        `${i.center.name}|${i.location?.name ?? "—"}|${i.category}`;
      const groups = new Map<string, typeof issues>();
      for (const i of issues) {
        const k = key(i);
        groups.set(k, [...(groups.get(k) ?? []), i]);
      }
      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "area", label: "Area" },
          { key: "category", label: "Category" }, { key: "count", label: "Occurrences" },
          { key: "critical", label: "Critical/High" }, { key: "last", label: "Most recent" },
        ],
        rows: [...groups.entries()]
          .filter(([, v]) => v.length > 1)
          .map(([k, v]) => {
            const [centreName, area, category] = k.split("|");
            return {
              centre: centreName, area, category, count: v.length,
              critical: v.filter((x) => ["CRITICAL", "HIGH"].includes(x.severity)).length,
              last: dt(v.map((x) => x.createdAt).sort((a, b) => b.getTime() - a.getTime())[0]),
            };
          })
          .sort((a, b) => Number(b.count) - Number(a.count)),
      };
    }

    // ---------------------------------------------------------------- 12
    case "generator-runtime": {
      const events = await prisma.generatorEvent.findMany({
        where: {
          ...centre, type: "OFF", atServer: { gte: from, lte: to },
          ...(f.generatorId ? { generatorId: f.generatorId } : {}),
        },
        include: {
          generator: { select: { name: true, code: true, center: { select: { name: true } } } },
          user: { select: { name: true } },
        },
        orderBy: { atServer: "desc" },
      });
      return {
        title,
        columns: [
          { key: "when", label: "Stopped" }, { key: "centre", label: "Centre" },
          { key: "generator", label: "Generator" }, { key: "user", label: "Operator" },
          { key: "hours", label: "Run (h)" }, { key: "fuel", label: "Fuel used (L)" },
          { key: "lph", label: "L/h" },
        ],
        rows: events.map((e) => ({
          when: dt(e.atServer), centre: e.generator.center.name,
          generator: `${e.generator.name} (${e.generator.code})`, user: e.user.name,
          hours: num((e.runMinutes ?? 0) / 60, 2), fuel: num(e.fuelUsedL, 1), lph: num(e.litresPerHour, 2),
        })),
      };
    }

    // ---------------------------------------------------------------- 13
    case "generator-fuel": {
      const gens = await prisma.generator.findMany({
        where: { ...centre, deletedAt: null, ...(f.generatorId ? { id: f.generatorId } : {}) },
        include: {
          center: { select: { name: true } },
          events: { where: { type: "OFF", atServer: { gte: from, lte: to } } },
          refills: { where: { at: { gte: from, lte: to } } },
        },
      });
      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "generator", label: "Generator" },
          { key: "runs", label: "Runs" }, { key: "hours", label: "Total hours" },
          { key: "used", label: "Fuel used (L)" }, { key: "avgLph", label: "Avg L/h" },
          { key: "normal", label: "Normal max L/h" },
          { key: "refilled", label: "Refilled (L)" }, { key: "cost", label: "Fuel cost" },
        ],
        rows: gens.map((g) => {
          const hours = g.events.reduce((s, e) => s + (e.runMinutes ?? 0) / 60, 0);
          const used = g.events.reduce((s, e) => s + (e.fuelUsedL ?? 0), 0);
          return {
            centre: g.center.name, generator: `${g.name} (${g.code})`,
            runs: g.events.length, hours: num(hours, 1), used: num(used, 1),
            avgLph: hours > 0 ? num(used / hours, 2) : "",
            normal: g.normalLphMax != null ? num(g.normalLphMax, 2) : "",
            refilled: num(g.refills.reduce((s, r) => s + r.litres, 0), 1),
            cost: num(g.refills.reduce((s, r) => s + (r.totalCost ?? 0), 0), 2),
          };
        }),
      };
    }

    // ---------------------------------------------------------------- 14
    case "generator-discrepancy": {
      const rows = await prisma.generatorDiscrepancy.findMany({
        where: {
          ...centre, detectedAt: { gte: from, lte: to },
          ...(f.generatorId ? { generatorId: f.generatorId } : {}),
          ...(f.severity ? { severity: f.severity } : {}),
        },
        include: {
          generator: { select: { name: true, code: true, center: { select: { name: true } } } },
          resolvedBy: { select: { name: true } },
        },
        orderBy: { detectedAt: "desc" },
      });
      return {
        title,
        columns: [
          { key: "when", label: "Detected" }, { key: "centre", label: "Centre" },
          { key: "generator", label: "Generator" }, { key: "rule", label: "Rule" },
          { key: "severity", label: "Severity" }, { key: "expected", label: "Expected" },
          { key: "actual", label: "Actual" }, { key: "status", label: "Status" },
          { key: "resolvedBy", label: "Resolved by" },
        ],
        rows: rows.map((d) => ({
          when: dt(d.detectedAt), centre: d.generator.center.name,
          generator: `${d.generator.name} (${d.generator.code})`,
          rule: RULE_LABELS[d.ruleCode] ?? d.ruleCode, severity: d.severity,
          expected: d.expected ?? "", actual: d.actual ?? "",
          status: d.resolvedAt ? "Resolved" : "Open",
          resolvedBy: d.resolvedBy?.name ?? "",
        })),
      };
    }

    // ---------------------------------------------------------------- 15
    case "diesel-refill": {
      const rows = await prisma.generatorRefill.findMany({
        where: {
          ...centre, at: { gte: from, lte: to },
          ...(f.generatorId ? { generatorId: f.generatorId } : {}),
        },
        include: {
          generator: { select: { name: true, code: true, center: { select: { name: true } } } },
          user: { select: { name: true } },
        },
        orderBy: { at: "desc" },
      });
      return {
        title,
        columns: [
          { key: "when", label: "When" }, { key: "centre", label: "Centre" },
          { key: "generator", label: "Generator" }, { key: "litres", label: "Litres" },
          { key: "rate", label: "Rate" }, { key: "cost", label: "Total cost" },
          { key: "vendor", label: "Vendor" }, { key: "invoice", label: "Invoice" },
          { key: "user", label: "Recorded by" },
        ],
        rows: rows.map((r) => ({
          when: dt(r.at), centre: r.generator.center.name,
          generator: `${r.generator.name} (${r.generator.code})`,
          litres: num(r.litres, 1), rate: num(r.costPerL, 2), cost: num(r.totalCost, 2),
          vendor: r.vendor ?? "", invoice: r.invoiceRef ?? "", user: r.user.name,
        })),
      };
    }

    // ---------------------------------------------------------------- 16
    case "ai-accuracy": {
      // How often the model was right, per model version. Only REVIEWED findings
      // count — an unreviewed finding is not evidence either way, and including
      // it would silently inflate whichever number you were hoping for.
      const rows0 = await prisma.aiPhotoFinding.findMany({
        where: {
          analysedAt: { gte: from, lte: to },
          ...(f.centerId ? { centerId: f.centerId } : {}),
          driver: { not: "human" },
        },
        select: { model: true, driver: true, verdict: true, confidence: true, severity: true },
      });

      const byModel = new Map<string, typeof rows0>();
      for (const r of rows0) {
        const k = `${r.driver} / ${r.model}`;
        byModel.set(k, [...(byModel.get(k) ?? []), r]);
      }

      const rows = [...byModel.entries()].map(([model, rs]) => {
        const reviewed = rs.filter((r) => r.verdict !== "UNREVIEWED");
        const accepted = reviewed.filter((r) => r.verdict === "ACCEPTED").length;
        const corrected = reviewed.filter((r) => r.verdict === "CORRECTED").length;
        const rejected = reviewed.filter((r) => r.verdict === "NOT_APPLICABLE").length;
        const avgConf = rs.reduce((s, r) => s + r.confidence, 0) / (rs.length || 1);
        return {
          model,
          total: rs.length,
          reviewed: reviewed.length,
          accepted,
          corrected,
          rejected,
          accuracyPct: reviewed.length ? Math.round((accepted / reviewed.length) * 100) : "",
          avgConfidence: num(avgConf * 100, 0),
        };
      });

      // Findings a human added that the model never reported — its misses.
      const missed = await prisma.aiPhotoFinding.count({
        where: {
          analysedAt: { gte: from, lte: to }, driver: "human", verdict: "ADDED",
          ...(f.centerId ? { centerId: f.centerId } : {}),
        },
      });
      if (missed > 0) {
        rows.push({
          model: "— missed by the model (added by staff)",
          total: missed, reviewed: missed, accepted: 0, corrected: 0, rejected: 0,
          accuracyPct: "", avgConfidence: "",
        });
      }

      return {
        title,
        columns: [
          { key: "model", label: "Driver / model" },
          { key: "total", label: "Findings" },
          { key: "reviewed", label: "Reviewed" },
          { key: "accepted", label: "Accepted" },
          { key: "corrected", label: "Corrected" },
          { key: "rejected", label: "Rejected" },
          { key: "accuracyPct", label: "Accuracy %" },
          { key: "avgConfidence", label: "Avg confidence %" },
        ],
        rows,
        note: rows.length === 0
          ? "No AI findings in this period. Analysis runs only when HK_AI_DRIVER is not \"stub\"."
          : "Accuracy counts reviewed findings only — accepted ÷ reviewed. Unreviewed findings are excluded so the figure is not inflated.",
      };
    }

    // ---------------------------------------------------------------- 17
    case "ai-correction": {
      // The corrections themselves — what the model said versus what the
      // supervisor said. This is the training signal the brief asks to retain.
      const rows0 = await prisma.aiPhotoFinding.findMany({
        where: {
          analysedAt: { gte: from, lte: to },
          verdict: { in: ["CORRECTED", "NOT_APPLICABLE", "ADDED"] },
          ...(f.centerId ? { centerId: f.centerId } : {}),
        },
        orderBy: { reviewedAt: "desc" },
        take: 500,
        include: {
          reviewedBy: { select: { name: true } },
          photo: { select: { location: { select: { name: true, center: { select: { name: true } } } } } },
        },
      });

      return {
        title,
        columns: [
          { key: "when", label: "Reviewed" },
          { key: "centre", label: "Centre" },
          { key: "area", label: "Area" },
          { key: "verdict", label: "Verdict" },
          { key: "model", label: "Model" },
          { key: "said", label: "Model said" },
          { key: "actual", label: "Supervisor said" },
          { key: "severityChange", label: "Severity" },
          { key: "by", label: "Reviewed by" },
        ],
        rows: rows0.map((r) => ({
          when: dt(r.reviewedAt),
          centre: r.photo.location.center.name,
          area: r.photo.location.name,
          verdict: r.verdict === "NOT_APPLICABLE" ? "Rejected"
            : r.verdict === "ADDED" ? "Model missed it" : "Corrected",
          model: r.driver === "human" ? "—" : r.model,
          said: r.driver === "human" ? "(nothing)" : r.issue,
          actual: r.correctedIssue ?? (r.verdict === "ADDED" ? r.issue : r.verdict === "NOT_APPLICABLE" ? "(not a real issue)" : ""),
          severityChange: r.correctedSeverity && r.correctedSeverity !== r.severity
            ? `${r.severity} → ${r.correctedSeverity}` : r.severity,
          by: r.reviewedBy?.name ?? "",
        })),
        note: "Every correction is retained for model evaluation (brief §6). The model's original wording is never overwritten.",
      };
    }

    // ---------------------------------------------------------------- 18
    case "centre-comparison": {
      const centres = await prisma.center.findMany({
        where: { active: true, ...(f.centerId ? { id: f.centerId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const rows = [];
      for (const c of centres) {
        const [rounds, issues, openIssues, discrepancies, locations] = await Promise.all([
          prisma.inspectionRound.count({ where: { centerId: c.id, startedAt: { gte: from, lte: to } } }),
          prisma.hkIssue.count({ where: { centerId: c.id, createdAt: { gte: from, lte: to } } }),
          prisma.hkIssue.count({ where: { centerId: c.id, status: { notIn: ["CLOSED", "CANCELLED"] } } }),
          prisma.generatorDiscrepancy.count({ where: { centerId: c.id, detectedAt: { gte: from, lte: to } } }),
          prisma.inspectionLocation.count({ where: { centerId: c.id, deletedAt: null, active: true } }),
        ]);
        const closed = await prisma.hkIssue.findMany({
          where: { centerId: c.id, status: "CLOSED", closedAt: { gte: from, lte: to } },
          select: { createdAt: true, closedAt: true, dueAt: true },
        });
        const avgH = closed.length
          ? closed.reduce((s, i) => s + (i.closedAt!.getTime() - i.createdAt.getTime()) / 3600_000, 0) / closed.length
          : null;
        const onTime = closed.filter((i) => !(i.dueAt && i.closedAt! > i.dueAt)).length;
        rows.push({
          centre: c.name, areas: locations, rounds,
          issues, open: openIssues, closed: closed.length,
          slaPct: closed.length ? Math.round((onTime / closed.length) * 100) : "",
          avgHours: avgH != null ? num(avgH, 1) : "",
          genDiscrepancies: discrepancies,
        });
      }
      return {
        title,
        columns: [
          { key: "centre", label: "Centre" }, { key: "areas", label: "Areas" },
          { key: "rounds", label: "Rounds" }, { key: "issues", label: "Issues raised" },
          { key: "closed", label: "Closed" }, { key: "open", label: "Open" },
          { key: "slaPct", label: "Closed on time %" }, { key: "avgHours", label: "Avg resolution (h)" },
          { key: "genDiscrepancies", label: "Generator discrepancies" },
        ],
        rows,
      };
    }
  }
}

// ---- Renderers (mirrors src/lib/occupancy/reports.ts) ----

export function toCSV(t: ReportTable): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = t.columns.map((c) => esc(c.label)).join(",");
  const lines = t.rows.map((r) => t.columns.map((c) => esc(r[c.key] ?? "")).join(","));
  return [header, ...lines].join("\n");
}

export function toPrintableHTML(t: ReportTable, subtitle?: string): string {
  const head = t.columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const body = t.rows
    .map((r) => `<tr>${t.columns.map((c) => `<td>${esc(String(r[c.key] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
  @page { margin: 14mm; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a2e; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; }
  th { background: #f3f4f6; }
  .meta { color: #666; font-size: 11px; margin-bottom: 12px; }
  .note { background: #fef3c7; padding: 8px 10px; border-radius: 4px; font-size: 11px; margin-bottom: 12px; }
  @media screen { .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; background: #4f46e5; color: #fff; border: 0; border-radius: 6px; cursor: pointer; } }
  @media print { .print-btn { display: none; } }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  <h1>${esc(t.title)}</h1>
  <div class="meta">${subtitle ? esc(subtitle) + " · " : ""}${t.rows.length} rows · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}</div>
  ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
