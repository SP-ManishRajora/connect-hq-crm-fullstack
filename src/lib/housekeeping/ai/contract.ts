// The JSON contract from brief §6, plus the parsing that makes it survive
// contact with a real model.
//
// Vision models are unreliable JSON emitters: they wrap output in ```json
// fences, prepend "Here is the analysis:", emit `0.91%` for a confidence, or
// use "high" where an enum was demanded. Rejecting all of that would make the
// pipeline uselessly brittle, so we repair what is unambiguously repairable and
// reject only what is genuinely unusable.

import { z } from "zod";
import { AI_CATEGORIES, AI_SEVERITIES, enforceMinimumSeverity, type AiSeverity } from "./taxonomy";

const score = z.coerce.number().min(0).max(100);

// Confidence arrives as 0–1, or as a percentage, or as a string. Normalise.
const confidence = z.coerce.number().transform((n) => {
  const v = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, v));
});

const severity = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.enum(AI_SEVERITIES));

const category = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.enum(AI_CATEGORIES));

export const photoFindingSchema = z.object({
  category,
  issue: z.string().min(3).max(500),
  severity,
  confidence,
  recommended_action: z.string().max(500).nullish(),
});

export const photoAnalysisSchema = z.object({
  overall_condition: z.string().max(40).nullish(),
  cleanliness_score: score.nullish(),
  maintenance_score: score.nullish(),
  safety_score: score.nullish(),
  consumables_score: score.nullish(),
  issues: z.array(photoFindingSchema).max(25).default([]),
  consumables: z.record(z.string(), z.string()).nullish(),
  requires_immediate_action: z.coerce.boolean().nullish(),
});

export type PhotoAnalysis = z.infer<typeof photoAnalysisSchema>;
export type PhotoFinding = z.infer<typeof photoFindingSchema>;

export const beforeAfterSchema = z.object({
  appears_completed: z.coerce.boolean(),
  cleanliness_score_after: score.nullish(),
  remaining_issues: z.array(z.string().max(300)).max(15).default([]),
  confidence,
  needs_supervisor_review: z.coerce.boolean().nullish(),
  comment: z.string().max(500).nullish(),
});
export type BeforeAfter = z.infer<typeof beforeAfterSchema>;

export const meterReadingSchema = z.object({
  fuel_reading: z.coerce.number().nullish(),
  hour_meter: z.coerce.number().nullish(),
  voltage: z.coerce.number().nullish(),
  current: z.coerce.number().nullish(),
  frequency: z.coerce.number().nullish(),
  confidence,
});
export type MeterReading = z.infer<typeof meterReadingSchema>;

/**
 * Pulls a JSON object out of whatever the model actually returned.
 * Handles ``` fences, leading prose and trailing commentary.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();

  // 1. Straight parse.
  try {
    return JSON.parse(text);
  } catch { /* keep trying */ }

  // 2. Fenced block, with or without a language tag.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch { /* keep trying */ }
  }

  // 3. First balanced {...} in the text — survives "Here is the analysis: {...}".
  const start = text.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("No parseable JSON object in the model response");
}

export type ParseResult<T> =
  | { ok: true; value: T; repaired: boolean }
  | { ok: false; error: string };

export function parsePhotoAnalysis(raw: string): ParseResult<PhotoAnalysis> {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const direct = photoAnalysisSchema.safeParse(json);
  if (direct.success) {
    return { ok: true, value: applySeverityFloor(direct.data), repaired: false };
  }

  // Repair pass: drop only the individual findings that fail, rather than
  // throwing away an otherwise-good analysis because one issue was malformed.
  const obj = (json ?? {}) as Record<string, unknown>;
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const kept: PhotoFinding[] = [];
  for (const it of rawIssues) {
    const p = photoFindingSchema.safeParse(it);
    if (p.success) kept.push(p.data);
  }

  const retry = photoAnalysisSchema.safeParse({ ...obj, issues: kept });
  if (retry.success) {
    return { ok: true, value: applySeverityFloor(retry.data), repaired: true };
  }

  return {
    ok: false,
    error: retry.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}

// A model reporting "exposed wire" as MEDIUM is overridden to CRITICAL — the
// same principle as hazard escalation on manually raised issues.
function applySeverityFloor(a: PhotoAnalysis): PhotoAnalysis {
  return {
    ...a,
    issues: a.issues.map((i) => ({
      ...i,
      severity: enforceMinimumSeverity(i.issue, i.severity as AiSeverity),
    })),
  };
}

export function parseBeforeAfter(raw: string): ParseResult<BeforeAfter> {
  try {
    const r = beforeAfterSchema.safeParse(extractJson(raw));
    return r.success
      ? { ok: true, value: r.data, repaired: false }
      : { ok: false, error: r.error.issues.map((i) => i.message).join("; ") };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export function parseMeterReading(raw: string): ParseResult<MeterReading> {
  try {
    const r = meterReadingSchema.safeParse(extractJson(raw));
    return r.success
      ? { ok: true, value: r.data, repaired: false }
      : { ok: false, error: r.error.issues.map((i) => i.message).join("; ") };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
