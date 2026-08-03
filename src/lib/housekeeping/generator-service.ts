// Persistence layer for the generator discrepancy engine.
//
// The rules in generator-rules.ts are pure; this module gathers the context they
// need from the database, runs them, and records findings. Kept separate so the
// rules stay unit-testable without a database.

import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  checkFuelMovement, checkHourMeter, checkOcrMismatch, checkConflictingReadings,
  type Finding, type ReadingSnapshot, type RunContext,
} from "./generator-rules";
import { getGeneratorConfig } from "./settings";
import { raiseAlert, buildAlertBody, appUrl, ALERT_TYPES } from "./alerts";

// Persist findings. `dedupeWindowMin` stops the same rule firing repeatedly for
// the same reading when a cron re-runs.
export async function recordFindings(
  generatorId: string,
  centerId: string,
  findings: Finding[],
  ctx: { readingId?: string | null; eventId?: string | null; actorId?: string | null } = {},
  dedupeWindowMin = 60,
): Promise<number> {
  if (findings.length === 0) return 0;

  const since = new Date(Date.now() - dedupeWindowMin * 60_000);
  let created = 0;

  for (const f of findings) {
    const existing = await prisma.generatorDiscrepancy.findFirst({
      where: {
        generatorId,
        ruleCode: f.ruleCode,
        resolvedAt: null,
        ...(ctx.readingId
          ? { readingId: ctx.readingId }
          : { detectedAt: { gte: since } }),
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.generatorDiscrepancy.create({
      data: {
        generatorId,
        centerId,
        ruleCode: f.ruleCode,
        severity: f.severity,
        title: f.title,
        detail: f.detail ?? null,
        expected: f.expected ?? null,
        actual: f.actual ?? null,
        delta: f.delta ?? null,
        readingId: ctx.readingId ?? null,
        eventId: ctx.eventId ?? null,
      },
    });
    created++;
  }

  if (created > 0) {
    await logAction({
      userId: ctx.actorId ?? null,
      action: "HK_GENERATOR_DISCREPANCY",
      targetType: "Generator",
      targetId: generatorId,
      meta: {
        rules: findings.map((f) => f.ruleCode),
        severities: findings.map((f) => f.severity),
        readingId: ctx.readingId ?? null,
      },
    });

    // Phase 8 — notify. CRITICAL findings email immediately; lower severities
    // are recorded in-app and picked up by the daily digest, so a noisy rule
    // cannot bury the inbox.
    await notifyDiscrepancies(generatorId, centerId, findings, ctx.readingId ?? null);
  }

  return created;
}

// Raises an HkAlert per finding. Deduped on generator + rule + hour, so a
// repeating condition alerts once an hour rather than on every reading.
async function notifyDiscrepancies(
  generatorId: string,
  centerId: string,
  findings: Finding[],
  readingId: string | null,
) {
  const gen = await prisma.generator.findUnique({
    where: { id: generatorId },
    select: { name: true, code: true, center: { select: { name: true } } },
  });
  if (!gen) return;

  const hourBucket = new Date().toISOString().slice(0, 13); // yyyy-mm-ddThh

  for (const f of findings) {
    await raiseAlert({
      centerId,
      alertType: ALERT_TYPES.GENERATOR_DISCREPANCY,
      severity: f.severity,
      title: `${gen.name} (${gen.code}): ${f.title}`,
      body: buildAlertBody({
        centre: gen.center.name,
        area: `Generator ${gen.name} (${gen.code})`,
        alertType: f.ruleCode,
        severity: f.severity,
        previous: f.expected ?? null,
        current: f.actual ?? null,
        delta: f.delta ?? null,
        findings: f.detail ?? null,
        action: "Verify the reading against the panel and record what was found.",
        link: appUrl("/housekeeping/generator"),
      }),
      subjectType: "GeneratorDiscrepancy",
      subjectId: readingId ?? undefined,
      dedupeKey: `gen:${generatorId}:${f.ruleCode}:${hourBucket}`,
      meta: { ruleCode: f.ruleCode, expected: f.expected, actual: f.actual, delta: f.delta },
      // Only CRITICAL interrupts by email; the rest ride the daily digest.
      inAppOnly: f.severity !== "CRITICAL",
    });
  }
}

// Was there a valid ON period covering [from, to]? A run counts if the generator
// was on at any point in the interval — including a run still open.
export async function ranBetween(generatorId: string, from: Date, to: Date): Promise<boolean> {
  const onEvents = await prisma.generatorEvent.findMany({
    where: { generatorId, type: "ON", atServer: { lte: to } },
    orderBy: { atServer: "desc" },
    take: 20,
    select: { id: true, atServer: true },
  });

  for (const on of onEvents) {
    const off = await prisma.generatorEvent.findFirst({
      where: { generatorId, type: "OFF", atServer: { gt: on.atServer } },
      orderBy: { atServer: "asc" },
      select: { atServer: true },
    });
    const runEnd = off?.atServer ?? new Date(); // still running
    // Overlap test between [on, runEnd] and [from, to].
    if (on.atServer <= to && runEnd >= from) return true;
  }
  return false;
}

export async function refilledBetween(generatorId: string, from: Date, to: Date) {
  const r = await prisma.generatorRefill.findMany({
    where: { generatorId, at: { gt: from, lte: to } },
    select: { litres: true },
  });
  return { any: r.length > 0, litres: r.reduce((s, x) => s + x.litres, 0) };
}

// Runs every reading-time rule for a newly created reading and records findings.
export async function evaluateReading(readingId: string, actorId?: string | null): Promise<Finding[]> {
  const cfg = await getGeneratorConfig();

  const curr = await prisma.generatorReading.findUnique({
    where: { id: readingId },
    include: { photo: { select: { sha256: true } } },
  });
  if (!curr) return [];

  const findings: Finding[] = [];

  // Rule 6 — OCR vs typed, needs no history.
  const ocr = checkOcrMismatch(toSnapshot(curr), cfg);
  if (ocr) findings.push(ocr);

  // Previous reading in the chain gives us the delta rules.
  const prev = curr.previousReadingId
    ? await prisma.generatorReading.findUnique({ where: { id: curr.previousReadingId } })
    : await prisma.generatorReading.findFirst({
        where: { generatorId: curr.generatorId, at: { lt: curr.at } },
        orderBy: { at: "desc" },
      });

  if (prev) {
    const ran = await ranBetween(curr.generatorId, prev.at, curr.at);
    const refill = await refilledBetween(curr.generatorId, prev.at, curr.at);
    const ctx: RunContext = {
      ranBetween: ran,
      refilledBetween: refill.any,
      refillLitres: refill.litres,
    };

    findings.push(...checkFuelMovement(toSnapshot(prev), toSnapshot(curr), ctx, cfg));
    const hrs = checkHourMeter(toSnapshot(prev), toSnapshot(curr), ctx, cfg);
    if (hrs) findings.push(hrs);

    // Rule 12 — a different operator recording something different, close in time.
    if (prev.userId !== curr.userId) {
      const conflict = checkConflictingReadings(toSnapshot(prev), toSnapshot(curr), cfg);
      if (conflict) findings.push(conflict);
    }
  }

  await recordFindings(curr.generatorId, curr.centerId, findings, {
    readingId: curr.id,
    actorId,
  });

  return findings;
}

function toSnapshot(r: {
  id: string; at: Date; userId: string;
  fuelReading: number | null; hourMeter: number | null;
  ocrFuel: number | null; ocrHourMeter: number | null; ocrConfidence: number | null;
  runningAtReading: boolean;
}): ReadingSnapshot {
  return {
    id: r.id,
    at: r.at,
    userId: r.userId,
    fuelReading: r.fuelReading,
    hourMeter: r.hourMeter,
    ocrFuel: r.ocrFuel,
    ocrHourMeter: r.ocrHourMeter,
    ocrConfidence: r.ocrConfidence,
    runningAtReading: r.runningAtReading,
  };
}

// Current open run for a generator, or null when it is off.
export async function openRun(generatorId: string) {
  const lastOn = await prisma.generatorEvent.findFirst({
    where: { generatorId, type: "ON" },
    orderBy: { atServer: "desc" },
  });
  if (!lastOn) return null;

  const off = await prisma.generatorEvent.findFirst({
    where: { generatorId, type: "OFF", atServer: { gt: lastOn.atServer } },
    orderBy: { atServer: "asc" },
  });
  return off ? null : lastOn;
}
