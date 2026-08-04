// Prompt templates (brief §6). Admin-overridable via HkSetting key `ai.prompts`.
//
// Written to constrain the model rather than invite prose: it is given the exact
// taxonomy, told to report only what is visible, and told to return nothing but
// JSON. The "report only what you can see" instruction matters more than it
// looks — vision models will otherwise list plausible-sounding issues that are
// not in the photograph at all, which would fill the work queue with fiction.

import { AI_CATEGORIES, CATEGORY_ISSUES } from "./taxonomy";

function taxonomyBlock(): string {
  return AI_CATEGORIES.map(
    (c) => `- ${c}: ${CATEGORY_ISSUES[c].slice(0, 8).join(", ")}`,
  ).join("\n");
}

export const DEFAULT_PHOTO_PROMPT = `You are inspecting a photograph of a coworking-centre area for a facilities report.

Report ONLY what is clearly visible in this photograph. If the area looks acceptable, return an empty issues array — do not invent problems to seem useful, and do not describe anything you cannot actually see.

Use exactly these categories and this vocabulary:
{{TAXONOMY}}

Severity guide:
- CRITICAL: an immediate safety or hygiene hazard (exposed wire, open electrical panel, leak near electrics, diesel leak, blocked exit, severely unsanitary toilet)
- HIGH: needs attention today (overflowing bin, missing consumables in a bathroom, standing water)
- MEDIUM: should be fixed this week (marks on a wall, a dusty corner)
- LOW: cosmetic or presentational (chairs not aligned)

Score each dimension 0-100, where 100 is spotless and fully functional. Omit a score for a dimension the photograph does not show.

Return ONLY a JSON object, no commentary, no markdown fences:
{
  "overall_condition": "excellent|good|fair|poor|critical",
  "cleanliness_score": 0-100,
  "maintenance_score": 0-100,
  "safety_score": 0-100,
  "consumables_score": 0-100,
  "issues": [
    {
      "category": "one of the categories above",
      "issue": "short factual description of what you see",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "confidence": 0.0-1.0,
      "recommended_action": "what should be done"
    }
  ],
  "requires_immediate_action": true|false
}`;

export const DEFAULT_BEFORE_AFTER_PROMPT = `Two photographs of the same area are provided: the first was taken BEFORE cleaning, the second AFTER.

Judge whether the reported problem appears to have been resolved. Be fair to the person who did the work: differences in angle, lighting or time of day are not evidence of failure. Only report a remaining issue if you can actually see it in the AFTER photograph.

Return ONLY a JSON object:
{
  "appears_completed": true|false,
  "cleanliness_score_after": 0-100,
  "remaining_issues": ["..."],
  "confidence": 0.0-1.0,
  "needs_supervisor_review": true|false,
  "comment": "one sentence"
}`;

export const DEFAULT_METER_PROMPT = `Read the visible instrument values from this photograph of a generator control panel or fuel gauge.

Report only digits you can actually read. If a value is blurred, obscured or absent, return null for it rather than guessing — a wrong reading corrupts the fuel ledger and is worse than no reading.

Return ONLY a JSON object:
{
  "fuel_reading": number|null,
  "hour_meter": number|null,
  "voltage": number|null,
  "current": number|null,
  "frequency": number|null,
  "confidence": 0.0-1.0
}`;

export type PromptSet = {
  photo: string;
  beforeAfter: string;
  meter: string;
};

export const DEFAULT_PROMPTS: PromptSet = {
  photo: DEFAULT_PHOTO_PROMPT,
  beforeAfter: DEFAULT_BEFORE_AFTER_PROMPT,
  meter: DEFAULT_METER_PROMPT,
};

// Fills placeholders. Area context is appended so the model knows whether it is
// looking at a bathroom or a parking bay — the same photograph means different
// things in each.
export function renderPhotoPrompt(
  template: string,
  ctx: { areaName?: string; category?: string; angle?: string; checklist?: string[] } = {},
): string {
  let out = template.replace("{{TAXONOMY}}", taxonomyBlock());

  const bits: string[] = [];
  if (ctx.areaName) bits.push(`Area: ${ctx.areaName}`);
  if (ctx.category) bits.push(`Area type: ${ctx.category.replace(/_/g, " ").toLowerCase()}`);
  if (ctx.angle) bits.push(`This photograph shows: ${ctx.angle}`);
  if (ctx.checklist?.length) bits.push(`Also check: ${ctx.checklist.join("; ")}`);

  if (bits.length) out += `\n\nContext:\n${bits.join("\n")}`;
  return out;
}
