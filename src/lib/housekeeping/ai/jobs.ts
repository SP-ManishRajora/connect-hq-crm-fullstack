// The analysis queue and consolidation (brief §§6–7).
//
// Central guarantee, from brief §6 and acceptance criterion #20: **AI never
// blocks or destroys inspection evidence.** Photographs are stored first and
// analysis is queued afterwards. If the model is down, unpulled or returning
// nonsense, the job retries with backoff, eventually parks as FAILED, and the
// inspection itself is completely unaffected.

import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { getAiConfig } from "../settings";
import { createIssue, type Severity } from "../issues";
import { analyzePhoto } from "./index";
import { isTransient } from "./types";
import {
  SEVERITY_WEIGHT, conditionFromScore, isCategory,
  type AiCategory, type AiSeverity,
} from "./taxonomy";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Queue a photograph for analysis. Safe to call repeatedly — one live job per
 *  subject. Never throws into the caller: a queueing failure must not fail an
 *  upload. */
export async function queuePhotoAnalysis(photoId: string, centerId?: string | null) {
  try {
    const cfg = await getAiConfig();
    if (!cfg.autoQueue) return null;

    const existing = await prisma.aiAnalysisJob.findFirst({
      where: { subjectType: "InspectionPhoto", subjectId: photoId, status: { in: ["PENDING", "RUNNING"] } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const job = await prisma.aiAnalysisJob.create({
      data: { subjectType: "InspectionPhoto", subjectId: photoId, kind: "PHOTO", centerId: centerId ?? null },
    });
    return job.id;
  } catch (e) {
    console.error("failed to queue AI analysis (upload unaffected):", e);
    return null;
  }
}

// Exponential backoff: 1, 2, 4, 8 minutes. A model that is down usually stays
// down for minutes, so hammering it every 30 seconds achieves nothing.
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 16) * 60_000;
}

export type RunResult = { claimed: number; done: number; failed: number; skipped: number };

/** Claims and runs a batch of pending jobs. Called by the cron route. */
export async function runPendingJobs(limit?: number): Promise<RunResult> {
  const cfg = await getAiConfig();
  const take = limit ?? cfg.batchSize;
  const now = new Date();

  const pending = await prisma.aiAnalysisJob.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take,
  });

  const out: RunResult = { claimed: pending.length, done: 0, failed: 0, skipped: 0 };

  for (const job of pending) {
    // Claim it. The updateMany guard means two concurrent runners cannot both
    // take the same job — whoever loses updates 0 rows and moves on.
    const claim = await prisma.aiAnalysisJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    try {
      if (job.kind === "PHOTO") await runPhotoJob(job.id, job.subjectId);
      else { out.skipped++; continue; }

      out.done++;
    } catch (e: any) {
      const attempts = job.attempts + 1;
      const retryable = isTransient(e) && attempts < cfg.maxAttempts;

      await prisma.aiAnalysisJob.update({
        where: { id: job.id },
        data: {
          status: retryable ? "PENDING" : "FAILED",
          lastError: String(e?.message ?? e).slice(0, 1000),
          nextAttemptAt: retryable ? new Date(Date.now() + backoffMs(attempts)) : undefined,
          finishedAt: retryable ? null : new Date(),
        },
      });
      if (!retryable) out.failed++;
    }
  }

  return out;
}

async function runPhotoJob(jobId: string, photoId: string) {
  const started = Date.now();
  const result = await analyzePhoto(photoId);

  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id: photoId },
    select: { visitId: true, location: { select: { centerId: true } } },
  });

  // Re-analysis replaces prior machine findings, but never a human's review —
  // a supervisor's correction is training data and must survive.
  await prisma.aiPhotoFinding.deleteMany({
    where: { photoId, verdict: "UNREVIEWED" },
  });

  for (const f of result.value.issues) {
    await prisma.aiPhotoFinding.create({
      data: {
        photoId,
        visitId: photo?.visitId ?? null,
        centerId: photo?.location.centerId ?? null,
        category: f.category,
        issue: f.issue,
        severity: f.severity,
        confidence: f.confidence,
        recommendedAction: f.recommended_action ?? null,
        driver: result.info.name,
        model: result.info.model,
        modelVersion: result.info.modelVersion ?? null,
        raw: result.raw.slice(0, 8000),
      },
    });
  }

  await prisma.inspectionPhoto.update({
    where: { id: photoId },
    data: { aiStatus: "DONE" },
  });

  await prisma.aiAnalysisJob.update({
    where: { id: jobId },
    data: {
      status: "DONE", finishedAt: new Date(), durationMs: Date.now() - started,
      driver: result.info.name, model: result.info.model, modelVersion: result.info.modelVersion,
    },
  });

  // Once every photo in a visit is analysed, consolidate the area.
  if (photo?.visitId) await maybeConsolidate(photo.visitId);
}

/** Builds the AreaSummary when a visit's photographs are all analysed. */
export async function maybeConsolidate(visitId: string) {
  const photos = await prisma.inspectionPhoto.findMany({
    where: { visitId },
    select: { id: true, aiStatus: true },
  });
  if (photos.length === 0) return;
  // Wait for the whole set — a partial summary would misrepresent the area.
  if (photos.some((p) => p.aiStatus === "PENDING")) return;

  await consolidateArea(visitId);
}

/**
 * Merges every finding across a visit into ONE area result (brief §7:
 * "must not simply repeat four separate image analyses").
 *
 * Deduplicates the same issue seen from multiple angles, keeps the worst
 * severity, and diffs against the previous visit to this area.
 */
export async function consolidateArea(visitId: string) {
  const visit = await prisma.inspectionVisit.findUnique({
    where: { id: visitId },
    include: {
      location: { select: { id: true, centerId: true } },
      photos: { select: { id: true } },
    },
  });
  if (!visit) return null;

  const findings = await prisma.aiPhotoFinding.findMany({
    where: { photoId: { in: visit.photos.map((p) => p.id) } },
    orderBy: { confidence: "desc" },
  });

  // Ignore findings a supervisor rejected — they are not real.
  const live = findings.filter((f) => f.verdict !== "NOT_APPLICABLE");

  // Dedupe: the same issue photographed from two angles is one problem.
  const byKey = new Map<string, (typeof live)[number]>();
  for (const f of live) {
    const key = `${f.category}|${normalise(f.correctedIssue ?? f.issue)}`;
    const prev = byKey.get(key);
    const sev = f.correctedSeverity ?? f.severity;
    if (!prev || SEVERITY_RANK[sev] < SEVERITY_RANK[prev.correctedSeverity ?? prev.severity]) {
      byKey.set(key, f);
    }
  }
  const merged = [...byKey.values()];

  // Score per dimension: start at 100 and deduct by severity weight.
  const dim = (c: AiCategory) => {
    const hits = merged.filter((f) => f.category === c);
    const penalty = hits.reduce(
      (s, f) => s + (SEVERITY_WEIGHT[(f.correctedSeverity ?? f.severity) as AiSeverity] ?? 5), 0,
    );
    return Math.max(0, 100 - penalty);
  };

  const cleanliness = dim("cleanliness");
  const maintenance = dim("maintenance");
  const safety = dim("safety");
  const consumables = dim("consumables");
  // Safety weighted hardest — a hazard should sink an area's score.
  const overall = Math.round(
    cleanliness * 0.35 + maintenance * 0.25 + safety * 0.3 + consumables * 0.1,
  );

  const criticalCount = merged.filter((f) => (f.correctedSeverity ?? f.severity) === "CRITICAL").length;
  const nonCriticalCount = merged.length - criticalCount;

  // --- diff against the previous visit to this area ---
  const prevSummary = await prisma.areaSummary.findFirst({
    where: { locationId: visit.location.id, visitId: { not: visitId } },
    orderBy: { createdAt: "desc" },
  });

  const current = merged.map((f) => normalise(f.correctedIssue ?? f.issue));
  const previous: string[] = prevSummary ? safeArray(prevSummary.repeatIssues).concat(safeArray(prevSummary.newIssues)) : [];

  const repeat = current.filter((i) => previous.includes(i));
  const fresh = current.filter((i) => !previous.includes(i));
  const resolved = previous.filter((i) => !current.includes(i));

  const trend = !prevSummary
    ? "first"
    : overall > (prevSummary.overallScore ?? 0) + 5 ? "improved"
    : overall < (prevSummary.overallScore ?? 0) - 5 ? "deteriorated"
    : "stable";

  const driverInfo = merged[0];

  const summary = await prisma.areaSummary.upsert({
    where: { visitId },
    create: {
      visitId,
      locationId: visit.location.id,
      centerId: visit.location.centerId,
      overallCondition: conditionFromScore(overall),
      cleanlinessScore: cleanliness, maintenanceScore: maintenance,
      safetyScore: safety, consumablesScore: consumables, overallScore: overall,
      criticalCount, nonCriticalCount,
      reinspectionRequired: criticalCount > 0 || overall < 55,
      newIssues: JSON.stringify(fresh),
      resolvedIssues: JSON.stringify(resolved),
      repeatIssues: JSON.stringify(repeat),
      trend,
      recommendedActions: JSON.stringify(
        merged.filter((f) => f.recommendedAction).slice(0, 10).map((f) => f.recommendedAction),
      ),
      driver: driverInfo?.driver ?? null,
      model: driverInfo?.model ?? null,
    },
    update: {
      overallCondition: conditionFromScore(overall),
      cleanlinessScore: cleanliness, maintenanceScore: maintenance,
      safetyScore: safety, consumablesScore: consumables, overallScore: overall,
      criticalCount, nonCriticalCount,
      reinspectionRequired: criticalCount > 0 || overall < 55,
      newIssues: JSON.stringify(fresh),
      resolvedIssues: JSON.stringify(resolved),
      repeatIssues: JSON.stringify(repeat),
      trend,
      analysedAt: new Date(),
    },
  });

  await autoCreateIssues(visitId, merged);
  return summary;
}

/**
 * Promotes high-confidence, high-severity findings into tracked issues
 * (resolves ledger D-04). Everything below the threshold stays advisory for the
 * supervisor to confirm — the stub's 0.05 confidence can never reach this.
 */
async function autoCreateIssues(
  visitId: string,
  findings: { id: string; category: string; issue: string; severity: string; confidence: number; correctedIssue: string | null; correctedSeverity: string | null; recommendedAction: string | null; issueId: string | null; photoId: string }[],
) {
  const cfg = await getAiConfig();
  const minRank = SEVERITY_RANK[cfg.autoIssueMinSeverity] ?? 1;

  const visit = await prisma.inspectionVisit.findUnique({
    where: { id: visitId },
    include: { location: { select: { id: true, centerId: true, name: true } } },
  });
  if (!visit) return;

  for (const f of findings) {
    if (f.issueId) continue; // already promoted
    const sev = (f.correctedSeverity ?? f.severity) as Severity;
    if ((SEVERITY_RANK[sev] ?? 9) > minRank) continue;
    if (f.confidence < cfg.autoIssueMinConfidence) continue;

    const title = (f.correctedIssue ?? f.issue).slice(0, 200);

    // Don't duplicate an issue already open for the same fault in this area.
    const dup = await prisma.hkIssue.findFirst({
      where: {
        locationId: visit.location.id,
        title,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      select: { id: true },
    });
    if (dup) {
      await prisma.aiPhotoFinding.update({ where: { id: f.id }, data: { issueId: dup.id } });
      continue;
    }

    const issue = await createIssue({
      centerId: visit.location.centerId,
      locationId: visit.location.id,
      visitId,
      source: "AI",
      category: isCategory(f.category) ? f.category : "cleanliness",
      title,
      description: [
        f.recommendedAction,
        `Detected automatically from an inspection photograph (confidence ${Math.round(f.confidence * 100)}%).`,
      ].filter(Boolean).join("\n\n"),
      severity: sev,
      beforePhotoId: f.photoId,
      raisedById: visit.userId,
    });

    await prisma.aiPhotoFinding.update({ where: { id: f.id }, data: { issueId: issue.id } });

    await logAction({
      userId: null,
      action: "HK_ISSUE_RAISED_BY_AI",
      targetType: "HkIssue",
      targetId: issue.id,
      meta: {
        findingId: f.id, confidence: f.confidence, severity: sev,
        locationName: visit.location.name,
      },
    });
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function safeArray(v: string | null): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
