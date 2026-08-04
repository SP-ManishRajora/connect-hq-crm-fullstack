import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError,
} from "@/lib/housekeeping/route-helpers";
import {
  getHkConfig, setHkConfig,
  getIssueConfig, setIssueConfig,
  getGeneratorConfig, setGeneratorConfig,
  getRequestConfig, setRequestConfig,
  getEfficiencyConfig, setEfficiencyConfig,
  getRetentionConfig, setRetentionConfig,
  getAiConfig, setAiConfig,
} from "@/lib/housekeeping/settings";

// GET/PATCH /api/housekeeping/settings — every tunable in one place (item 2.4).
//
// Each group keeps its own typed getter/setter; this route is only the
// aggregator, so adding a knob elsewhere does not mean touching this file.

export async function GET() {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const [inspection, issues, generator, requests, efficiency, retention, ai] = await Promise.all([
      getHkConfig(), getIssueConfig(), getGeneratorConfig(), getRequestConfig(),
      getEfficiencyConfig(), getRetentionConfig(), getAiConfig(),
    ]);
    return NextResponse.json({
      inspection, issues, generator, requests, efficiency, retention,
      // Prompts can be long; the UI edits them separately.
      ai: { ...ai, prompts: ai.prompts ?? {} },
      // Driver selection is an env var, not a setting — surfaced read-only so
      // an admin can see what is actually running.
      aiDriver: process.env.HK_AI_DRIVER || "stub",
      ocrDriver: process.env.HK_OCR_DRIVER || "stub",
    });
  } catch (e) {
    return handleError(e);
  }
}

const schema = z.object({
  group: z.enum(["inspection", "issues", "generator", "requests", "efficiency", "retention", "ai"]),
  // Validation happens inside each setter's own type; this route only routes.
  patch: z.record(z.string(), z.unknown()),
});

export async function PATCH(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(schema, await req.json());

    const before = await currentFor(b.group);
    const after = await applyTo(b.group, b.patch);

    await logAction({
      userId: u.id,
      action: "HK_SETTINGS_UPDATED",
      targetType: "HkSetting",
      targetId: b.group,
      // before → after, as the module's audit rule requires.
      meta: { group: b.group, before, after },
    });

    return NextResponse.json(after);
  } catch (e) {
    return handleError(e);
  }
}

async function currentFor(group: string) {
  switch (group) {
    case "inspection": return getHkConfig();
    case "issues": return getIssueConfig();
    case "generator": return getGeneratorConfig();
    case "requests": return getRequestConfig();
    case "efficiency": return getEfficiencyConfig();
    case "retention": return getRetentionConfig();
    default: return getAiConfig();
  }
}

async function applyTo(group: string, patch: Record<string, unknown>) {
  switch (group) {
    case "inspection": return setHkConfig(patch as never);
    case "issues": return setIssueConfig(patch as never);
    case "generator": return setGeneratorConfig(patch as never);
    case "requests": return setRequestConfig(patch as never);
    case "efficiency": return setEfficiencyConfig(patch as never);
    case "retention": return setRetentionConfig(patch as never);
    default: return setAiConfig(patch as never);
  }
}
