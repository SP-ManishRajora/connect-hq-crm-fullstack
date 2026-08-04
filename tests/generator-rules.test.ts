import { describe, it, expect } from "vitest";
import {
  checkFuelMovement, checkHourMeter, checkRanButNoHours, checkMissedPeriodicPhoto,
  checkOcrMismatch, checkConsumption, photoReusedFinding, checkBackdated,
  checkRunTooLong, checkConflictingReadings, RULES,
  type ReadingSnapshot, type RunContext,
} from "@/lib/housekeeping/generator-rules";
import { GENERATOR_DEFAULTS as cfg } from "@/lib/housekeeping/settings";

// The 12 discrepancy rules from brief §11.
//
// Negative cases matter as much as positive ones: a rule engine that cries wolf
// gets muted, and a muted engine protects nothing. Every rule therefore has both
// a "fires when it should" and a "stays quiet when it shouldn't" test.

const gen = {
  normalLphMin: 5, normalLphMax: 10,
  photoIntervalMin: 30, graceMin: 10, maxRunHours: 12,
};
const t0 = new Date("2026-08-03T10:00:00Z");
const t1 = new Date("2026-08-03T12:00:00Z");

const R = (
  fuel: number | null,
  hour: number | null,
  at = t0,
  userId = "u1",
  extra: Partial<ReadingSnapshot> = {},
): ReadingSnapshot => ({ at, userId, fuelReading: fuel, hourMeter: hour, ...extra });

const noActivity: RunContext = { ranBetween: false, refilledBetween: false };
const codes = (fs: { ruleCode: string }[]) => fs.map((f) => f.ruleCode);

describe("fuel movement (rules 1, 3, 7)", () => {
  it("flags a fuel drop with no recorded run", () => {
    const f = checkFuelMovement(R(100, 50), R(70, 50, t1), noActivity, cfg);
    expect(codes(f)).toContain(RULES.FUEL_DROP_NO_RUN);
    expect(codes(f)).toContain(RULES.FUEL_NO_EVENT);
    expect(f[0].severity).toBe("CRITICAL");
  });

  it("flags a fuel rise with no refill logged", () => {
    const f = checkFuelMovement(R(100, 50), R(180, 50, t1), noActivity, cfg);
    expect(codes(f)).toContain(RULES.FUEL_UP_NO_REFILL);
  });

  it("stays quiet when the drop is explained by a run", () => {
    const f = checkFuelMovement(R(100, 50), R(70, 52, t1), { ranBetween: true, refilledBetween: false }, cfg);
    expect(codes(f)).not.toContain(RULES.FUEL_DROP_NO_RUN);
  });

  it("stays quiet when the rise is explained by a refill", () => {
    const f = checkFuelMovement(
      R(100, 50), R(180, 50, t1),
      { ranBetween: false, refilledBetween: true, refillLitres: 80 }, cfg,
    );
    expect(codes(f)).not.toContain(RULES.FUEL_UP_NO_REFILL);
  });

  it("ignores drift inside the tolerance", () => {
    // 3 L < the 5 L default tolerance — gauge slosh, not theft.
    expect(checkFuelMovement(R(100, 50), R(97, 50, t1), noActivity, cfg)).toHaveLength(0);
  });

  it("ignores readings with a missing value", () => {
    expect(checkFuelMovement(R(null, 50), R(70, 50, t1), noActivity, cfg)).toHaveLength(0);
  });
});

describe("hour meter (rule 2)", () => {
  it("flags an advance with no ON event — it ran unlogged", () => {
    const f = checkHourMeter(R(100, 50), R(100, 53, t1), noActivity, cfg);
    expect(f?.ruleCode).toBe(RULES.HOURS_NO_EVENT);
    expect(f?.severity).toBe("CRITICAL");
  });

  it("stays quiet when a run was recorded", () => {
    expect(checkHourMeter(R(100, 50), R(100, 53, t1), { ranBetween: true, refilledBetween: false }, cfg)).toBeNull();
  });

  it("ignores movement inside the tolerance", () => {
    expect(checkHourMeter(R(100, 50), R(100, 50.05, t1), noActivity, cfg)).toBeNull();
  });
});

describe("ran but no hours (rule 4)", () => {
  it("flags a 2h run where the meter never moved", () => {
    expect(checkRanButNoHours(50, 50, 120, cfg)?.ruleCode).toBe(RULES.ON_NO_HOUR_CHANGE);
  });

  it("ignores a very short run — no movement is expected", () => {
    expect(checkRanButNoHours(50, 50, 2, cfg)).toBeNull();
  });

  it("stays quiet when the meter did move", () => {
    expect(checkRanButNoHours(50, 52, 120, cfg)).toBeNull();
  });
});

describe("missed periodic photo (rule 5)", () => {
  it("flags a reading older than interval + grace", () => {
    const f = checkMissedPeriodicPhoto(new Date(Date.now() - 55 * 60_000), gen);
    expect(f?.ruleCode).toBe(RULES.MISSED_PERIODIC_PHOTO);
  });

  it("stays quiet inside the window", () => {
    expect(checkMissedPeriodicPhoto(new Date(Date.now() - 20 * 60_000), gen)).toBeNull();
  });

  it("respects the grace period exactly", () => {
    // 30 + 10 = 40 min; 39 is inside, 41 is outside.
    expect(checkMissedPeriodicPhoto(new Date(Date.now() - 39 * 60_000), gen)).toBeNull();
    expect(checkMissedPeriodicPhoto(new Date(Date.now() - 41 * 60_000), gen)).not.toBeNull();
  });
});

describe("OCR mismatch (rule 6)", () => {
  it("flags a typed reading far from what was read", () => {
    const f = checkOcrMismatch(R(100, 50, t0, "u1", { ocrFuel: 130, ocrConfidence: 0.9 }), cfg);
    expect(f?.ruleCode).toBe(RULES.OCR_MISMATCH);
  });

  it("stays silent when OCR produced nothing (confidence 0)", () => {
    // This is the stub driver's behaviour — it must never manufacture a mismatch.
    expect(checkOcrMismatch(R(100, 50, t0, "u1", { ocrFuel: 999, ocrConfidence: 0 }), cfg)).toBeNull();
  });

  it("ignores a small disagreement inside tolerance", () => {
    expect(checkOcrMismatch(R(100, 50, t0, "u1", { ocrFuel: 105, ocrConfidence: 0.9 }), cfg)).toBeNull();
  });
});

describe("consumption (rule 8)", () => {
  it("flags a burn above normalLphMax × overrun factor", () => {
    // 10 L/h max × 1.5 = 15 ceiling; 20 is over.
    expect(checkConsumption(20, gen, cfg)?.ruleCode).toBe(RULES.CONSUMPTION_HIGH);
  });

  it("stays quiet inside the normal range", () => {
    expect(checkConsumption(9, gen, cfg)).toBeNull();
  });

  it("stays quiet when the generator has no configured range", () => {
    expect(checkConsumption(50, { ...gen, normalLphMax: null }, cfg)).toBeNull();
  });
});

describe("photo reuse (rule 9)", () => {
  it("is always critical — a recycled photo cannot evidence a new reading", () => {
    const f = photoReusedFinding("tank photo");
    expect(f.ruleCode).toBe(RULES.PHOTO_REUSED);
    expect(f.severity).toBe("CRITICAL");
  });
});

describe("backdating (rule 10)", () => {
  it("flags a claimed time far from server time", () => {
    expect(checkBackdated(new Date(t1.getTime() - 3 * 3600_000), t1, cfg)?.ruleCode)
      .toBe(RULES.BACKDATED_EVENT);
  });

  it("tolerates small clock drift", () => {
    expect(checkBackdated(new Date(t1.getTime() - 5 * 60_000), t1, cfg)).toBeNull();
  });

  it("does nothing when no time was claimed", () => {
    expect(checkBackdated(null, t1, cfg)).toBeNull();
  });
});

describe("run duration (rule 11)", () => {
  it("flags a run beyond maxRunHours", () => {
    expect(checkRunTooLong(new Date(Date.now() - 20 * 3600_000), gen)?.ruleCode)
      .toBe(RULES.RUN_TOO_LONG);
  });

  it("stays quiet inside the limit", () => {
    expect(checkRunTooLong(new Date(Date.now() - 3 * 3600_000), gen)).toBeNull();
  });
});

describe("conflicting readings (rule 12)", () => {
  const soon = new Date(t0.getTime() + 5 * 60_000);

  it("flags two operators disagreeing within the window", () => {
    expect(checkConflictingReadings(R(100, 50, t0, "u1"), R(140, 50, soon, "u2"), cfg)?.ruleCode)
      .toBe(RULES.CONFLICTING_READINGS);
  });

  it("ignores the same operator correcting themselves", () => {
    expect(checkConflictingReadings(R(100, 50, t0, "u1"), R(140, 50, soon, "u1"), cfg)).toBeNull();
  });

  it("ignores readings far apart in time — that is consumption, not conflict", () => {
    const later = new Date(t0.getTime() + 60 * 60_000);
    expect(checkConflictingReadings(R(100, 50, t0, "u1"), R(140, 50, later, "u2"), cfg)).toBeNull();
  });

  it("ignores agreement inside tolerance", () => {
    expect(checkConflictingReadings(R(100, 50, t0, "u1"), R(102, 50, soon, "u2"), cfg)).toBeNull();
  });
});
