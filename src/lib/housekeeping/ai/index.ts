// AI service entry point (brief §6 "AI model abstraction layer so that the model
// can be changed without rewriting the business logic").
//
// Everything outside this folder talks to these four functions and never to a
// driver directly. Swapping Ollama for a hosted API is an env-var change.

import { prisma } from "@/lib/db";
import { readPhoto } from "../storage";
import { getAiConfig } from "../settings";
import { StubDriver } from "./stub";
import { OllamaDriver } from "./ollama";
import { OpenAiCompatibleDriver } from "./openaiCompatible";
import { DEFAULT_PROMPTS, renderPhotoPrompt, type PromptSet } from "./prompts";
import type { AiDriver, AiResult, ImageInput } from "./types";
import type { PhotoAnalysis, BeforeAfter, MeterReading } from "./contract";

export * from "./types";
export * from "./contract";
export * from "./taxonomy";

let cached: { key: string; driver: AiDriver } | null = null;

export function getDriver(): AiDriver {
  const key = process.env.HK_AI_DRIVER || "stub";
  if (cached?.key === key) return cached.driver;

  const driver: AiDriver =
    key === "ollama" ? new OllamaDriver()
    : key === "openai-compatible" ? new OpenAiCompatibleDriver()
    : new StubDriver();

  cached = { key, driver };
  return driver;
}

export function isStub(): boolean {
  return (process.env.HK_AI_DRIVER || "stub") === "stub";
}

export async function aiHealth() {
  const d = getDriver();
  const h = await d.health();
  return { driver: d.name, ...h, stub: isStub() };
}

async function prompts(): Promise<PromptSet> {
  const cfg = await getAiConfig();
  return {
    photo: cfg.prompts?.photo || DEFAULT_PROMPTS.photo,
    beforeAfter: cfg.prompts?.beforeAfter || DEFAULT_PROMPTS.beforeAfter,
    meter: cfg.prompts?.meter || DEFAULT_PROMPTS.meter,
  };
}

async function loadImage(filePath: string, mimeType: string): Promise<ImageInput> {
  return { bytes: await readPhoto(filePath), mimeType };
}

/** Analyse one inspection photograph. Throws on failure — the caller decides
 *  whether to retry; evidence is never touched either way. */
export async function analyzePhoto(photoId: string): Promise<AiResult<PhotoAnalysis>> {
  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id: photoId },
    include: {
      location: { select: { name: true, category: true, checklist: true } },
    },
  });
  if (!photo) throw new Error("Photograph not found");
  if (photo.purgedAt) throw new Error("Photograph was purged under the retention policy");

  const p = await prompts();
  let checklist: string[] = [];
  try {
    const parsed = JSON.parse(photo.location.checklist ?? "[]");
    if (Array.isArray(parsed)) checklist = parsed.map(String);
  } catch { /* a malformed checklist must not block analysis */ }

  const prompt = renderPhotoPrompt(p.photo, {
    areaName: photo.location.name,
    category: photo.location.category,
    angle: photo.angle,
    checklist,
  });

  const image = await loadImage(photo.filePath, photo.mimeType);
  return getDriver().analyzePhoto(image, prompt);
}

/** Compare a corrective action's before/after pair (brief §29). Advisory only —
 *  it must never auto-reject a valid staff completion. */
export async function compareBeforeAfter(
  beforePhotoId: string,
  afterPhotoId: string,
): Promise<AiResult<BeforeAfter>> {
  const [b, a] = await Promise.all([
    prisma.inspectionPhoto.findUnique({ where: { id: beforePhotoId } }),
    prisma.inspectionPhoto.findUnique({ where: { id: afterPhotoId } }),
  ]);
  if (!b || !a) throw new Error("Before or after photograph not found");
  if (b.purgedAt || a.purgedAt) throw new Error("A photograph was purged under the retention policy");

  const p = await prompts();
  const [bi, ai] = await Promise.all([
    loadImage(b.filePath, b.mimeType),
    loadImage(a.filePath, a.mimeType),
  ]);
  return getDriver().compareBeforeAfter(bi, ai, p.beforeAfter);
}

/** Verify a cleaning request's after-photograph (brief §29).
 *
 *  Takes CleaningRequestPhoto ids rather than InspectionPhoto ids. When no
 *  client "before" photograph exists — the common case, since supplying one is
 *  optional — the after photo is assessed on its own instead of skipping the
 *  check entirely.
 *
 *  ADVISORY ONLY. Per the brief this must never auto-reject a valid staff
 *  completion; callers store the verdict and leave the decision to a human.
 */
export async function verifyRequestCompletion(
  requestId: string,
): Promise<AiResult<BeforeAfter> | null> {
  const photos = await prisma.cleaningRequestPhoto.findMany({
    where: { requestId, purgedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const before = photos.find((p) => p.kind === "BEFORE");
  const after = [...photos].reverse().find((p) => p.kind === "AFTER");
  if (!after) return null; // nothing submitted yet — not a failure

  const p = await prompts();
  const afterImg = await loadImage(after.filePath, after.mimeType);

  if (before) {
    const beforeImg = await loadImage(before.filePath, before.mimeType);
    return getDriver().compareBeforeAfter(beforeImg, afterImg, p.beforeAfter);
  }

  // No before photo: ask the same question against the after photo alone.
  return getDriver().compareBeforeAfter(afterImg, afterImg, p.beforeAfter);
}

/** Read a generator panel or gauge. Feeds the same fields as the OCR path, so
 *  rule 6 (OCR vs typed mismatch) works identically whichever produced them. */
export async function readMeter(generatorPhotoId: string): Promise<AiResult<MeterReading>> {
  const photo = await prisma.generatorPhoto.findUnique({ where: { id: generatorPhotoId } });
  if (!photo) throw new Error("Generator photograph not found");
  if (photo.purgedAt) throw new Error("Photograph was purged under the retention policy");

  const p = await prompts();
  const image = await loadImage(photo.filePath, photo.mimeType);
  return getDriver().readMeter(image, p.meter);
}
