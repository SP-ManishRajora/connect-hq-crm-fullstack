// Generator discrepancy engine — the 12 rules from brief §11.
//
// Design: every rule is a PURE function over a plain snapshot, so the whole
// engine is testable without a database and the persistence layer stays thin.
// Rules never throw and never mutate; they return a finding or null.
//
// Tolerances come from GeneratorConfig (admin-tunable) — nothing is hard-coded.

import type { GeneratorConfig } from "./settings";

export const RULES = {
  FUEL_NO_EVENT:        "GEN_FUEL_NO_EVENT",
  HOURS_NO_EVENT:       "GEN_HOURS_NO_EVENT",
  FUEL_DROP_NO_RUN:     "GEN_FUEL_DROP_NO_RUN",
  ON_NO_HOUR_CHANGE:    "GEN_ON_NO_HOUR_CHANGE",
  MISSED_PERIODIC_PHOTO:"GEN_MISSED_PERIODIC_PHOTO",
  OCR_MISMATCH:         "GEN_OCR_MISMATCH",
  FUEL_UP_NO_REFILL:    "GEN_FUEL_UP_NO_REFILL",
  CONSUMPTION_HIGH:     "GEN_CONSUMPTION_HIGH",
  PHOTO_REUSED:         "GEN_PHOTO_REUSED",
  BACKDATED_EVENT:      "GEN_BACKDATED_EVENT",
  RUN_TOO_LONG:         "GEN_RUN_TOO_LONG",
  CONFLICTING_READINGS: "GEN_CONFLICTING_READINGS",
} as const;

export type RuleCode = (typeof RULES)[keyof typeof RULES];

export type Finding = {
  ruleCode: RuleCode;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  detail?: string;
  expected?: string;
  actual?: string;
  delta?: number;
};

export const RULE_LABELS: Record<string, string> = {
  GEN_FUEL_NO_EVENT: "Fuel changed with no generator run",
  GEN_HOURS_NO_EVENT: "Hour-meter increased with no generator run",
  GEN_FUEL_DROP_NO_RUN: "Fuel dropped beyond tolerance without a run",
  GEN_ON_NO_HOUR_CHANGE: "Marked ON but the hour-meter did not move",
  GEN_MISSED_PERIODIC_PHOTO: "Mandatory photograph missed while running",
  GEN_OCR_MISMATCH: "OCR and typed reading disagree",
  GEN_FUEL_UP_NO_REFILL: "Fuel increased with no refill entry",
  GEN_CONSUMPTION_HIGH: "Fuel consumption above the normal range",
  GEN_PHOTO_REUSED: "A previously submitted photograph was reused",
  GEN_BACKDATED_EVENT: "Generator ON/OFF was backdated",
  GEN_RUN_TOO_LONG: "Generator has been running beyond the allowed duration",
  GEN_CONFLICTING_READINGS: "Two users entered conflicting readings",
};

// A minimal view of what the rules need — deliberately not Prisma types, so the
// engine can be unit-tested with plain objects.
export type ReadingSnapshot = {
  id?: string;
  at: Date;
  userId?: string;
  fuelReading: number | null;
  hourMeter: number | null;
  ocrFuel?: number | null;
  ocrHourMeter?: number | null;
  ocrConfidence?: number | null;
  runningAtReading?: boolean;
  photoSha256?: string | null;
};

export type GeneratorSnapshot = {
  normalLphMin: number | null;
  normalLphMax: number | null;
  photoIntervalMin: number;
  graceMin: number;
  maxRunHours: number;
};

export type RunContext = {
  // Was there a valid ON event covering the interval between the two readings?
  ranBetween: boolean;
  // Was a refill recorded between the two readings?
  refilledBetween: boolean;
  refillLitres?: number;
};

// ---------------------------------------------------------------------------
// Rules 1–3, 7: fuel movement vs recorded activity
// ---------------------------------------------------------------------------

export function checkFuelMovement(
  prev: ReadingSnapshot,
  curr: ReadingSnapshot,
  ctx: RunContext,
  cfg: GeneratorConfig,
): Finding[] {
  const out: Finding[] = [];
  if (prev.fuelReading == null || curr.fuelReading == null) return out;

  const delta = curr.fuelReading - prev.fuelReading;
  if (Math.abs(delta) <= cfg.fuelToleranceL) return out;

  if (delta < 0) {
    // Fuel went DOWN beyond tolerance.
    if (!ctx.ranBetween) {
      out.push({
        ruleCode: RULES.FUEL_DROP_NO_RUN,
        severity: "CRITICAL",
        title: RULE_LABELS.GEN_FUEL_DROP_NO_RUN,
        detail:
          `Fuel fell by ${Math.abs(delta).toFixed(1)} L between ${fmt(prev.at)} and ${fmt(curr.at)}, ` +
          `but no generator run was recorded in that period. Possible theft or an unrecorded run.`,
        expected: `≥ ${(prev.fuelReading - cfg.fuelToleranceL).toFixed(1)} L`,
        actual: `${curr.fuelReading.toFixed(1)} L`,
        delta,
      });
    }
  } else {
    // Fuel went UP beyond tolerance — only a refill explains that.
    if (!ctx.refilledBetween) {
      out.push({
        ruleCode: RULES.FUEL_UP_NO_REFILL,
        severity: "HIGH",
        title: RULE_LABELS.GEN_FUEL_UP_NO_REFILL,
        detail:
          `Fuel rose by ${delta.toFixed(1)} L with no diesel refill entry. ` +
          `Either the refill was not logged or a reading is wrong.`,
        expected: "a matching refill entry",
        actual: `+${delta.toFixed(1)} L, no refill`,
        delta,
      });
    }
  }

  // Any unexplained change at all (either direction) with no event AND no refill.
  if (!ctx.ranBetween && !ctx.refilledBetween && delta < 0) {
    out.push({
      ruleCode: RULES.FUEL_NO_EVENT,
      severity: "CRITICAL",
      title: RULE_LABELS.GEN_FUEL_NO_EVENT,
      detail: `Fuel reading changed by ${delta.toFixed(1)} L with neither a run nor a refill recorded.`,
      delta,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Rule 2: hour-meter moved with no ON event
// ---------------------------------------------------------------------------

export function checkHourMeter(
  prev: ReadingSnapshot,
  curr: ReadingSnapshot,
  ctx: RunContext,
  cfg: GeneratorConfig,
): Finding | null {
  if (prev.hourMeter == null || curr.hourMeter == null) return null;
  const delta = curr.hourMeter - prev.hourMeter;
  if (delta <= cfg.hourToleranceH) return null;
  if (ctx.ranBetween) return null;

  return {
    ruleCode: RULES.HOURS_NO_EVENT,
    severity: "CRITICAL",
    title: RULE_LABELS.GEN_HOURS_NO_EVENT,
    detail:
      `The hour-meter advanced ${delta.toFixed(2)} h between ${fmt(prev.at)} and ${fmt(curr.at)} ` +
      `with no generator ON event recorded. The generator ran without being logged.`,
    expected: `${prev.hourMeter.toFixed(2)} h`,
    actual: `${curr.hourMeter.toFixed(2)} h`,
    delta,
  };
}

// ---------------------------------------------------------------------------
// Rule 4: marked ON but the hour-meter never moved
// ---------------------------------------------------------------------------

export function checkRanButNoHours(
  startHour: number | null,
  stopHour: number | null,
  runMinutes: number,
  cfg: GeneratorConfig,
): Finding | null {
  if (startHour == null || stopHour == null) return null;
  if (runMinutes < 5) return null; // too short to expect movement
  const delta = stopHour - startHour;
  if (delta > cfg.hourToleranceH) return null;

  return {
    ruleCode: RULES.ON_NO_HOUR_CHANGE,
    severity: "HIGH",
    title: RULE_LABELS.GEN_ON_NO_HOUR_CHANGE,
    detail:
      `The generator was marked ON for ${Math.round(runMinutes)} minutes but the hour-meter ` +
      `moved only ${delta.toFixed(2)} h. Either it did not actually run or a reading is wrong.`,
    expected: `≈ ${(runMinutes / 60).toFixed(2)} h`,
    actual: `${delta.toFixed(2)} h`,
    delta,
  };
}

// ---------------------------------------------------------------------------
// Rule 5: mandatory periodic photo missed while running
// ---------------------------------------------------------------------------

export function checkMissedPeriodicPhoto(
  lastReadingAt: Date,
  gen: GeneratorSnapshot,
  now = new Date(),
): Finding | null {
  const dueMs = gen.photoIntervalMin * 60_000;
  const graceMs = gen.graceMin * 60_000;
  const elapsed = now.getTime() - lastReadingAt.getTime();
  if (elapsed <= dueMs + graceMs) return null;

  const lateMin = Math.round((elapsed - dueMs) / 60_000);
  return {
    ruleCode: RULES.MISSED_PERIODIC_PHOTO,
    severity: "HIGH",
    title: RULE_LABELS.GEN_MISSED_PERIODIC_PHOTO,
    detail:
      `The generator is running but no reading has been submitted for ${Math.round(elapsed / 60_000)} minutes ` +
      `(required every ${gen.photoIntervalMin} min, ${gen.graceMin} min grace). ${lateMin} min overdue.`,
    expected: `every ${gen.photoIntervalMin} min`,
    actual: `${Math.round(elapsed / 60_000)} min ago`,
    delta: lateMin,
  };
}

// ---------------------------------------------------------------------------
// Rule 6: OCR vs operator-typed reading
// ---------------------------------------------------------------------------

export function checkOcrMismatch(r: ReadingSnapshot, cfg: GeneratorConfig): Finding | null {
  // Only meaningful when OCR actually produced something.
  if (!r.ocrConfidence || r.ocrConfidence <= 0) return null;

  const parts: string[] = [];
  let worst = 0;

  if (r.ocrFuel != null && r.fuelReading != null) {
    const d = Math.abs(r.ocrFuel - r.fuelReading);
    if (d > cfg.ocrMismatchFuelL) {
      parts.push(`fuel: typed ${r.fuelReading.toFixed(1)} L vs read ${r.ocrFuel.toFixed(1)} L`);
      worst = Math.max(worst, d);
    }
  }
  if (r.ocrHourMeter != null && r.hourMeter != null) {
    const d = Math.abs(r.ocrHourMeter - r.hourMeter);
    if (d > cfg.ocrMismatchHourH) {
      parts.push(`hours: typed ${r.hourMeter.toFixed(2)} vs read ${r.ocrHourMeter.toFixed(2)}`);
      worst = Math.max(worst, d);
    }
  }
  if (parts.length === 0) return null;

  return {
    ruleCode: RULES.OCR_MISMATCH,
    severity: "MEDIUM",
    title: RULE_LABELS.GEN_OCR_MISMATCH,
    detail: `The photograph and the typed reading disagree — ${parts.join("; ")}. Verify against the panel.`,
    delta: worst,
  };
}

// ---------------------------------------------------------------------------
// Rule 8: consumption above the normal range
// ---------------------------------------------------------------------------

export function checkConsumption(
  litresPerHour: number,
  gen: GeneratorSnapshot,
  cfg: GeneratorConfig,
): Finding | null {
  if (gen.normalLphMax == null || gen.normalLphMax <= 0) return null;
  const ceiling = gen.normalLphMax * cfg.consumptionOverrunFactor;
  if (litresPerHour <= ceiling) return null;

  return {
    ruleCode: RULES.CONSUMPTION_HIGH,
    severity: "HIGH",
    title: RULE_LABELS.GEN_CONSUMPTION_HIGH,
    detail:
      `This run burned ${litresPerHour.toFixed(2)} L/h against a normal maximum of ` +
      `${gen.normalLphMax.toFixed(2)} L/h. Possible leak, theft, or a mis-read gauge.`,
    expected: `≤ ${ceiling.toFixed(2)} L/h`,
    actual: `${litresPerHour.toFixed(2)} L/h`,
    delta: litresPerHour - gen.normalLphMax,
  };
}

// ---------------------------------------------------------------------------
// Rule 9: reused photograph
// ---------------------------------------------------------------------------

export function photoReusedFinding(whereSeen: string): Finding {
  return {
    ruleCode: RULES.PHOTO_REUSED,
    severity: "CRITICAL",
    title: RULE_LABELS.GEN_PHOTO_REUSED,
    detail: `This photograph has already been submitted (${whereSeen}). A recycled photo cannot evidence a new reading.`,
  };
}

// ---------------------------------------------------------------------------
// Rule 10: backdated ON/OFF
// ---------------------------------------------------------------------------

export function checkBackdated(
  claimedAt: Date | null,
  serverAt: Date,
  cfg: GeneratorConfig,
): Finding | null {
  if (!claimedAt) return null;
  const diffMin = Math.abs(serverAt.getTime() - claimedAt.getTime()) / 60_000;
  if (diffMin <= cfg.backdateToleranceMin) return null;

  const past = claimedAt.getTime() < serverAt.getTime();
  return {
    ruleCode: RULES.BACKDATED_EVENT,
    severity: "HIGH",
    title: RULE_LABELS.GEN_BACKDATED_EVENT,
    detail:
      `The operator recorded this event as ${past ? "having happened" : "happening"} ` +
      `${Math.round(diffMin)} min ${past ? "earlier" : "later"} than the server time. ` +
      `The server time is authoritative and has been used.`,
    expected: fmt(serverAt),
    actual: fmt(claimedAt),
    delta: diffMin,
  };
}

// ---------------------------------------------------------------------------
// Rule 11: still ON beyond the allowed duration
// ---------------------------------------------------------------------------

export function checkRunTooLong(
  onAt: Date,
  gen: GeneratorSnapshot,
  now = new Date(),
): Finding | null {
  const hours = (now.getTime() - onAt.getTime()) / 3_600_000;
  if (hours <= gen.maxRunHours) return null;

  return {
    ruleCode: RULES.RUN_TOO_LONG,
    severity: "HIGH",
    title: RULE_LABELS.GEN_RUN_TOO_LONG,
    detail:
      `The generator has been marked ON for ${hours.toFixed(1)} h, beyond the ${gen.maxRunHours} h limit. ` +
      `Either it is genuinely still running or an OFF event was never recorded.`,
    expected: `≤ ${gen.maxRunHours} h`,
    actual: `${hours.toFixed(1)} h`,
    delta: hours - gen.maxRunHours,
  };
}

// ---------------------------------------------------------------------------
// Rule 12: two users, conflicting readings close together
// ---------------------------------------------------------------------------

export function checkConflictingReadings(
  a: ReadingSnapshot,
  b: ReadingSnapshot,
  cfg: GeneratorConfig,
): Finding | null {
  if (!a.userId || !b.userId || a.userId === b.userId) return null;
  const gapMin = Math.abs(b.at.getTime() - a.at.getTime()) / 60_000;
  if (gapMin > cfg.conflictWindowMin) return null;

  const fuelGap =
    a.fuelReading != null && b.fuelReading != null ? Math.abs(a.fuelReading - b.fuelReading) : 0;
  const hourGap =
    a.hourMeter != null && b.hourMeter != null ? Math.abs(a.hourMeter - b.hourMeter) : 0;

  if (fuelGap <= cfg.fuelToleranceL && hourGap <= cfg.hourToleranceH) return null;

  return {
    ruleCode: RULES.CONFLICTING_READINGS,
    severity: "MEDIUM",
    title: RULE_LABELS.GEN_CONFLICTING_READINGS,
    detail:
      `Two operators recorded different readings within ${Math.round(gapMin)} min — ` +
      `fuel differs by ${fuelGap.toFixed(1)} L, hours by ${hourGap.toFixed(2)}. One entry is wrong.`,
    delta: Math.max(fuelGap, hourGap),
  };
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};
