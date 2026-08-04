// The driver contract. Everything above this line is business logic; everything
// below it is a swappable inference backend.
//
// Drivers receive raw image bytes and a prompt, and return raw text. Parsing,
// validation, severity flooring and persistence all happen in the shared layer,
// so a new backend only has to know how to call its own API.

import type { PhotoAnalysis, BeforeAfter, MeterReading } from "./contract";

export type ImageInput = {
  bytes: Buffer;
  mimeType: string;
};

export type DriverInfo = {
  /** Driver id: "stub" | "ollama" | "openai-compatible" */
  name: string;
  /** The model actually used, e.g. "llava:7b" — recorded on every result. */
  model: string;
  modelVersion?: string;
};

export type AiResult<T> = {
  value: T;
  info: DriverInfo;
  /** Raw model output, stored verbatim for later evaluation. */
  raw: string;
  durationMs: number;
  /** True when the response needed repairing before it validated. */
  repaired?: boolean;
};

export interface AiDriver {
  readonly name: string;
  /** Is this driver configured and reachable? Checked by the health endpoint. */
  health(): Promise<{ ok: boolean; detail: string; model?: string }>;

  analyzePhoto(image: ImageInput, prompt: string): Promise<AiResult<PhotoAnalysis>>;
  compareBeforeAfter(
    before: ImageInput,
    after: ImageInput,
    prompt: string,
  ): Promise<AiResult<BeforeAfter>>;
  readMeter(image: ImageInput, prompt: string): Promise<AiResult<MeterReading>>;
}

// Thrown for a transient failure worth retrying (timeout, connection refused,
// 5xx). Anything else is treated as permanent and fails the job immediately —
// retrying a malformed prompt 5 times just wastes the queue.
export class AiTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransientError";
  }
}

export function isTransient(e: unknown): boolean {
  if (e instanceof AiTransientError) return true;
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return (
    m.includes("timeout") ||
    // "The operation timed out" / "timed-out" — AbortSignal.timeout() and
    // several fetch implementations phrase it this way. Missing it would mark a
    // genuine timeout permanent and never retry it.
    m.includes("timed out") ||
    m.includes("timed-out") ||
    m.includes("aborted") ||
    m.includes("econnrefused") ||
    m.includes("econnreset") ||
    m.includes("fetch failed") ||
    m.includes("socket") ||
    /\b(429|500|502|503|504)\b/.test(m)
  );
}
