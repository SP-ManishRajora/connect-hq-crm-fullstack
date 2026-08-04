// Local multimodal inference via Ollama (brief §6: "locally deployable ...
// instead of depending entirely on an external cloud AI service").
//
// Photographs never leave the building with this driver, which is the whole
// point — inspection evidence can contain people, badges and client property.
//
// Config: HK_AI_BASE_URL (default http://localhost:11434), HK_AI_MODEL
// (e.g. llava:7b, llama3.2-vision:11b, moondream), HK_AI_TIMEOUT_MS.
//
// CPU-only inference is slow (roughly 30–60 s per photograph on 8 cores), which
// is exactly why analysis runs off a queue rather than in the request path.

import {
  AiTransientError, type AiDriver, type AiResult, type DriverInfo, type ImageInput,
} from "./types";
import {
  parsePhotoAnalysis, parseBeforeAfter, parseMeterReading,
  type PhotoAnalysis, type BeforeAfter, type MeterReading,
} from "./contract";

const BASE = () => (process.env.HK_AI_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const MODEL = () => process.env.HK_AI_MODEL || "llava:7b";
const TIMEOUT = () => Number(process.env.HK_AI_TIMEOUT_MS || 120_000);

type OllamaResponse = { response?: string; error?: string; model?: string };

async function generate(prompt: string, images: string[]): Promise<{ text: string; model: string; ms: number }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT());

  let res: Response;
  try {
    res = await fetch(`${BASE()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL(),
        prompt,
        images,          // base64, no data: prefix
        stream: false,
        format: "json",  // Ollama constrains output to JSON where the model supports it
        options: { temperature: 0.1 }, // near-deterministic: this is inspection, not prose
      }),
    });
  } catch (e: any) {
    clearTimeout(timer);
    // Connection refused / aborted / DNS — all worth retrying later.
    throw new AiTransientError(`Ollama unreachable at ${BASE()}: ${e?.message ?? e}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 404 means the model was never pulled — permanent until someone acts.
    if (res.status === 404) {
      throw new Error(
        `Model "${MODEL()}" is not available on the Ollama server. Run: ollama pull ${MODEL()}`,
      );
    }
    throw new AiTransientError(`Ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as OllamaResponse;
  if (json.error) throw new Error(`Ollama error: ${json.error}`);
  if (!json.response) throw new Error("Ollama returned an empty response");

  return { text: json.response, model: json.model ?? MODEL(), ms: Date.now() - started };
}

function info(model: string): DriverInfo {
  return { name: "ollama", model, modelVersion: process.env.HK_AI_MODEL_VERSION };
}

export class OllamaDriver implements AiDriver {
  readonly name = "ollama";

  async health() {
    try {
      const res = await fetch(`${BASE()}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, detail: `Ollama HTTP ${res.status}` };
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const wanted = MODEL();
      if (!names.some((n) => n === wanted || n.startsWith(wanted.split(":")[0]))) {
        return {
          ok: false,
          detail: `Ollama is running but "${wanted}" is not pulled. Run: ollama pull ${wanted}`,
          model: wanted,
        };
      }
      return { ok: true, detail: `Ollama ready at ${BASE()}`, model: wanted };
    } catch (e: any) {
      return { ok: false, detail: `Ollama unreachable at ${BASE()}: ${e?.message ?? e}` };
    }
  }

  async analyzePhoto(image: ImageInput, prompt: string): Promise<AiResult<PhotoAnalysis>> {
    const { text, model, ms } = await generate(prompt, [image.bytes.toString("base64")]);
    const parsed = parsePhotoAnalysis(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms, repaired: parsed.repaired };
  }

  async compareBeforeAfter(
    before: ImageInput, after: ImageInput, prompt: string,
  ): Promise<AiResult<BeforeAfter>> {
    const { text, model, ms } = await generate(prompt, [
      before.bytes.toString("base64"),
      after.bytes.toString("base64"),
    ]);
    const parsed = parseBeforeAfter(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms };
  }

  async readMeter(image: ImageInput, prompt: string): Promise<AiResult<MeterReading>> {
    const { text, model, ms } = await generate(prompt, [image.bytes.toString("base64")]);
    const parsed = parseMeterReading(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms };
  }
}
