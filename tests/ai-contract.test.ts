import { describe, it, expect } from "vitest";
import {
  extractJson, parsePhotoAnalysis, parseBeforeAfter, parseMeterReading,
} from "@/lib/housekeeping/ai/contract";
import {
  enforceMinimumSeverity, conditionFromScore, isCategory, isSeverity,
  SEVERITY_WEIGHT,
} from "@/lib/housekeeping/ai/taxonomy";
import { StubDriver } from "@/lib/housekeeping/ai/stub";
import { isTransient, AiTransientError } from "@/lib/housekeeping/ai/types";

// Vision models are unreliable JSON emitters. These tests pin the behaviour that
// keeps a messy-but-usable response from being thrown away, and a genuinely
// unusable one from being silently accepted.

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a ```json fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("unwraps a bare fence", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("survives leading prose", () => {
    expect(extractJson('Here is the analysis:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("survives trailing commentary", () => {
    expect(extractJson('{"a":1}\n\nLet me know if you need more detail.')).toEqual({ a: 1 });
  });

  it("handles nested braces and braces inside strings", () => {
    const src = 'Result: {"issue":"pipe {leaking}","meta":{"n":2}} done';
    expect(extractJson(src)).toEqual({ issue: "pipe {leaking}", meta: { n: 2 } });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractJson("I cannot analyse this image.")).toThrow(/No parseable JSON/);
  });
});

describe("parsePhotoAnalysis", () => {
  const good = JSON.stringify({
    overall_condition: "poor",
    cleanliness_score: 58,
    issues: [
      { category: "cleanliness", issue: "Wet and stained floor", severity: "high", confidence: 0.91 },
    ],
  });

  it("accepts the contract from the brief", () => {
    const r = parsePhotoAnalysis(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.issues[0].severity).toBe("HIGH"); // lower-case normalised
      expect(r.value.cleanliness_score).toBe(58);
    }
  });

  it("normalises a percentage confidence to 0-1", () => {
    const r = parsePhotoAnalysis(JSON.stringify({
      issues: [{ category: "safety", issue: "wet floor", severity: "HIGH", confidence: 91 }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.issues[0].confidence).toBeCloseTo(0.91, 2);
  });

  it("coerces string scores", () => {
    const r = parsePhotoAnalysis('{"cleanliness_score":"72","issues":[]}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cleanliness_score).toBe(72);
  });

  it("drops one malformed finding but keeps the rest", () => {
    // Rejecting the whole analysis because one issue was bad would waste a
    // perfectly good inference run.
    const r = parsePhotoAnalysis(JSON.stringify({
      issues: [
        { category: "cleanliness", issue: "dusty sill", severity: "LOW", confidence: 0.8 },
        { category: "not-a-category", issue: "???", severity: "WHENEVER", confidence: "yes" },
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.issues).toHaveLength(1);
      expect(r.repaired).toBe(true);
    }
  });

  it("returns an empty analysis when the area is clean", () => {
    const r = parsePhotoAnalysis('{"overall_condition":"excellent","issues":[]}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.issues).toHaveLength(0);
  });

  it("fails on genuinely unusable output", () => {
    const r = parsePhotoAnalysis("the image shows a bathroom");
    expect(r.ok).toBe(false);
  });

  it("forces hazards to CRITICAL even when the model under-rates them", () => {
    // A model calling an exposed wire "LOW" must not bury a real hazard.
    const r = parsePhotoAnalysis(JSON.stringify({
      issues: [{ category: "safety", issue: "exposed wire behind panel", severity: "LOW", confidence: 0.9 }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.issues[0].severity).toBe("CRITICAL");
  });
});

describe("severity floor", () => {
  it.each([
    "exposed wire near the sink",
    "open electrical panel",
    "diesel leakage under the tank",
    "water leakage by the switchboard",
  ])("escalates %j to CRITICAL", (issue) => {
    expect(enforceMinimumSeverity(issue, "LOW")).toBe("CRITICAL");
  });

  it("leaves ordinary findings at the reported severity", () => {
    expect(enforceMinimumSeverity("dusty windowsill", "LOW")).toBe("LOW");
    expect(enforceMinimumSeverity("overflowing dustbin", "HIGH")).toBe("HIGH");
  });
});

describe("scoring helpers", () => {
  it("maps scores to condition bands", () => {
    expect(conditionFromScore(95)).toBe("excellent");
    expect(conditionFromScore(80)).toBe("good");
    expect(conditionFromScore(60)).toBe("fair");
    expect(conditionFromScore(40)).toBe("poor");
    expect(conditionFromScore(10)).toBe("critical");
  });

  it("weights severity so a critical finding dominates", () => {
    expect(SEVERITY_WEIGHT.CRITICAL).toBeGreaterThan(SEVERITY_WEIGHT.HIGH);
    expect(SEVERITY_WEIGHT.HIGH).toBeGreaterThan(SEVERITY_WEIGHT.MEDIUM);
    expect(SEVERITY_WEIGHT.MEDIUM).toBeGreaterThan(SEVERITY_WEIGHT.LOW);
  });

  it("validates taxonomy membership", () => {
    expect(isCategory("cleanliness")).toBe(true);
    expect(isCategory("vibes")).toBe(false);
    expect(isSeverity("CRITICAL")).toBe(true);
    expect(isSeverity("URGENT")).toBe(false);
  });
});

describe("before/after and meter contracts", () => {
  it("parses a before/after verdict", () => {
    const r = parseBeforeAfter('{"appears_completed":true,"remaining_issues":[],"confidence":0.8}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.appears_completed).toBe(true);
  });

  it("parses a meter reading with nulls for unreadable dials", () => {
    const r = parseMeterReading('{"fuel_reading":120.5,"hour_meter":null,"confidence":0.6}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fuel_reading).toBe(120.5);
      expect(r.value.hour_meter).toBeNull();
    }
  });
});

describe("stub driver safety", () => {
  const stub = new StubDriver();
  const img = { bytes: Buffer.from("fake-image-bytes"), mimeType: "image/jpeg" };

  it("reports itself as unconfigured", async () => {
    const h = await stub.health();
    expect(h.detail).toMatch(/no model is configured/i);
  });

  it("never produces a finding confident enough to auto-create an issue", async () => {
    // Default threshold is 0.7 — the stub must stay far below it, or it would
    // manufacture work orders for problems nobody has seen.
    const r = await stub.analyzePhoto(img, "prompt");
    for (const f of r.value.issues) expect(f.confidence).toBeLessThan(0.2);
  });

  it("labels its output as unconfigured rather than inventing defects", async () => {
    const r = await stub.analyzePhoto(img, "prompt");
    expect(r.value.issues[0].issue).toMatch(/not configured/i);
  });

  it("never contradicts a staff completion", async () => {
    const r = await stub.compareBeforeAfter(img, img, "prompt");
    expect(r.value.appears_completed).toBe(true);
    expect(r.value.needs_supervisor_review).toBe(true);
  });

  it("returns nulls for meter readings, never guesses", async () => {
    // A guessed fuel figure would corrupt the generator ledger.
    const r = await stub.readMeter(img, "prompt");
    expect(r.value.fuel_reading).toBeNull();
    expect(r.value.hour_meter).toBeNull();
    expect(r.value.confidence).toBe(0);
  });

  it("is deterministic for identical input", async () => {
    const a = await stub.analyzePhoto(img, "p");
    const b = await stub.analyzePhoto(img, "p");
    expect(a.raw).toBe(b.raw);
  });
});

describe("transient error classification", () => {
  it("retries connection and timeout failures", () => {
    expect(isTransient(new AiTransientError("boom"))).toBe(true);
    expect(isTransient(new Error("connect ECONNREFUSED 127.0.0.1:11434"))).toBe(true);
    expect(isTransient(new Error("The operation timed out"))).toBe(true);
    expect(isTransient(new Error("AI endpoint HTTP 503: overloaded"))).toBe(true);
  });

  it("does not retry a permanent fault", () => {
    // Retrying a missing model or a bad key four times just wastes the queue.
    expect(isTransient(new Error('Model "llava:7b" is not available'))).toBe(false);
    expect(isTransient(new Error("Model output did not validate: category: invalid"))).toBe(false);
  });
});
