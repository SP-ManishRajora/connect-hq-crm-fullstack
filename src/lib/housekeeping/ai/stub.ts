// Deterministic stub driver — the default, and what ships until a real model is
// configured.
//
// Design rule, same as the OCR stub: it must be OBVIOUSLY a placeholder. It
// returns a single clearly-labelled finding with low confidence rather than
// plausible-looking fake defects. Inventing "wet floor near washbasin" would
// create real work orders for imaginary problems and quietly poison the trend
// data — far worse than returning nothing.
//
// It is deterministic (seeded by the image bytes) so tests are stable.

import { createHash } from "crypto";
import type { AiDriver, AiResult, DriverInfo, ImageInput } from "./types";
import type { PhotoAnalysis, BeforeAfter, MeterReading } from "./contract";

const INFO: DriverInfo = { name: "stub", model: "stub-v1", modelVersion: "1" };

function seed(bytes: Buffer): number {
  const h = createHash("sha256").update(bytes).digest();
  return h.readUInt32BE(0) / 0xffffffff; // 0–1
}

export class StubDriver implements AiDriver {
  readonly name = "stub";

  async health() {
    return {
      ok: true,
      detail:
        "Stub driver — no model is configured. Photographs are stored and queued, " +
        "but no real analysis is performed. Set HK_AI_DRIVER to enable analysis.",
      model: INFO.model,
    };
  }

  async analyzePhoto(image: ImageInput, _prompt: string): Promise<AiResult<PhotoAnalysis>> {
    const s = seed(image.bytes);
    // Neutral mid-band scores: they must not look like a real assessment, and
    // must not drag a centre's average up or down in reports.
    const value: PhotoAnalysis = {
      overall_condition: "fair",
      cleanliness_score: 70,
      maintenance_score: 70,
      safety_score: 70,
      consumables_score: 70,
      issues: [
        {
          category: "presentation",
          issue: "AI analysis not configured — this photograph has not been assessed",
          severity: "LOW",
          // Deliberately below any sane auto-issue threshold, so the stub can
          // never create work orders.
          confidence: 0.05,
          recommended_action:
            "Set HK_AI_DRIVER to a configured model to enable real analysis.",
        },
      ],
      requires_immediate_action: false,
    };
    return {
      value,
      info: INFO,
      raw: JSON.stringify({ ...value, _stub: true, _seed: Number(s.toFixed(6)) }),
      durationMs: 1,
    };
  }

  async compareBeforeAfter(
    _before: ImageInput, _after: ImageInput, _prompt: string,
  ): Promise<AiResult<BeforeAfter>> {
    const value: BeforeAfter = {
      appears_completed: true,       // never contradict a staff completion
      cleanliness_score_after: null,
      remaining_issues: [],
      confidence: 0.05,
      needs_supervisor_review: true, // defer to a human, always
      comment: "AI comparison not configured — a supervisor should verify visually.",
    };
    return { value, info: INFO, raw: JSON.stringify({ ...value, _stub: true }), durationMs: 1 };
  }

  async readMeter(_image: ImageInput, _prompt: string): Promise<AiResult<MeterReading>> {
    // Nulls, never numbers — a guessed reading would corrupt the fuel ledger.
    const value: MeterReading = {
      fuel_reading: null, hour_meter: null, voltage: null,
      current: null, frequency: null, confidence: 0,
    };
    return { value, info: INFO, raw: JSON.stringify({ ...value, _stub: true }), durationMs: 1 };
  }
}
