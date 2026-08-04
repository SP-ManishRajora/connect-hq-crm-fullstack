// OpenAI-compatible chat-completions driver (brief §6: "optional external AI API
// as a configurable fallback").
//
// Works with anything speaking that wire format — the OpenAI API, Anthropic via
// a compatible gateway, vLLM, LM Studio, LocalAI, OpenRouter. Configure with
// HK_AI_BASE_URL, HK_AI_MODEL and HK_AI_API_KEY.
//
// Note the privacy trade-off, which the brief cares about: with a hosted
// endpoint, inspection photographs leave your infrastructure. Prefer the
// ollama driver where that matters.

import {
  AiTransientError, type AiDriver, type AiResult, type DriverInfo, type ImageInput,
} from "./types";
import {
  parsePhotoAnalysis, parseBeforeAfter, parseMeterReading,
  type PhotoAnalysis, type BeforeAfter, type MeterReading,
} from "./contract";

const BASE = () => (process.env.HK_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = () => process.env.HK_AI_MODEL || "gpt-4o-mini";
const TIMEOUT = () => Number(process.env.HK_AI_TIMEOUT_MS || 90_000);

function imagePart(img: ImageInput) {
  return {
    type: "image_url" as const,
    image_url: { url: `data:${img.mimeType};base64,${img.bytes.toString("base64")}` },
  };
}

async function chat(prompt: string, images: ImageInput[]): Promise<{ text: string; model: string; ms: number }> {
  const key = process.env.HK_AI_API_KEY;
  if (!key) throw new Error("HK_AI_API_KEY is not set");

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BASE()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT()),
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...images.map(imagePart)],
          },
        ],
      }),
    });
  } catch (e: any) {
    throw new AiTransientError(`AI endpoint unreachable: ${e?.message ?? e}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 401/403/404 are configuration faults — retrying cannot fix them.
    if ([401, 403, 404].includes(res.status)) {
      throw new Error(`AI endpoint rejected the request (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }
    throw new AiTransientError(`AI endpoint HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI endpoint returned no content");

  return { text, model: json.model ?? MODEL(), ms: Date.now() - started };
}

function info(model: string): DriverInfo {
  return { name: "openai-compatible", model, modelVersion: process.env.HK_AI_MODEL_VERSION };
}

export class OpenAiCompatibleDriver implements AiDriver {
  readonly name = "openai-compatible";

  async health() {
    if (!process.env.HK_AI_API_KEY) {
      return { ok: false, detail: "HK_AI_API_KEY is not set" };
    }
    try {
      const res = await fetch(`${BASE()}/models`, {
        headers: { Authorization: `Bearer ${process.env.HK_AI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { ok: true, detail: `Reachable at ${BASE()}`, model: MODEL() }
        : { ok: false, detail: `HTTP ${res.status} from ${BASE()}` };
    } catch (e: any) {
      return { ok: false, detail: `Unreachable: ${e?.message ?? e}` };
    }
  }

  async analyzePhoto(image: ImageInput, prompt: string): Promise<AiResult<PhotoAnalysis>> {
    const { text, model, ms } = await chat(prompt, [image]);
    const parsed = parsePhotoAnalysis(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms, repaired: parsed.repaired };
  }

  async compareBeforeAfter(
    before: ImageInput, after: ImageInput, prompt: string,
  ): Promise<AiResult<BeforeAfter>> {
    const { text, model, ms } = await chat(prompt, [before, after]);
    const parsed = parseBeforeAfter(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms };
  }

  async readMeter(image: ImageInput, prompt: string): Promise<AiResult<MeterReading>> {
    const { text, model, ms } = await chat(prompt, [image]);
    const parsed = parseMeterReading(text);
    if (parsed.ok !== true) throw new Error(`Model output did not validate: ${parsed.error}`);
    return { value: parsed.value, info: info(model), raw: text, durationMs: ms };
  }
}
