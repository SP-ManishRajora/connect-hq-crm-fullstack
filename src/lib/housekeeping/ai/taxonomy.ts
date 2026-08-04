// The issue taxonomy from brief §6, as a typed structure.
//
// This is the vocabulary the model is asked to use. Constraining it matters:
// a free-text model will happily invent "floor situation suboptimal", which is
// impossible to group, count or trend. Every finding must land in one of these
// categories, and the example issues below are fed into the prompt so the model
// mirrors the phrasing.

export const AI_CATEGORIES = [
  "cleanliness",
  "consumables",
  "maintenance",
  "safety",
  "presentation",
] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

export const AI_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type AiSeverity = (typeof AI_SEVERITIES)[number];

export const CATEGORY_ISSUES: Record<AiCategory, string[]> = {
  cleanliness: [
    "wet floor", "dirty floor", "stains", "dust", "dirt in corners",
    "overflowing dustbin", "unclean toilet", "dirty washbasin", "dirty mirror",
    "debris", "cobwebs", "unclean tables", "unorganised furniture",
    "unclean parking area",
  ],
  consumables: [
    "missing toilet paper", "missing handwash", "missing tissue paper",
    "missing sanitiser", "missing dustbin liner", "empty soap dispenser",
    "low consumable level",
  ],
  maintenance: [
    "water leakage", "damaged tap", "broken fixture", "damaged toilet seat",
    "cracked tile", "damaged furniture", "faulty light", "exposed wire",
    "damaged switchboard", "seepage", "dampness", "blocked drain",
    "non-working exhaust", "broken lock or door",
  ],
  safety: [
    "obstructed passage", "wet-floor risk", "exposed electrical connection",
    "fire-safety obstruction", "open electrical panel", "unsafe material storage",
    "diesel leakage", "oil leakage", "unauthorised item in electricity room",
    "generator-area obstruction",
  ],
  presentation: [
    "chairs not aligned", "tables not arranged", "reception area not presentable",
    "loose wires", "unnecessary boxes", "improper storage",
    "branding or signage damage",
  ],
};

// Findings the brief lists as inherently critical (§10). A model that reports
// one of these at a lower severity is overridden upward — the same principle as
// the hazard escalation in the issue flow: never let a mis-rating bury a hazard.
const ALWAYS_CRITICAL = [
  "exposed wire", "exposed electrical connection", "open electrical panel",
  "damaged switchboard", "diesel leakage", "fire-safety obstruction",
  "water leakage", "unsafe generator",
];

export function enforceMinimumSeverity(issue: string, reported: AiSeverity): AiSeverity {
  const hay = issue.toLowerCase();
  if (ALWAYS_CRITICAL.some((p) => hay.includes(p))) return "CRITICAL";
  return reported;
}

// Which category a score belongs to, for the consolidated area summary.
export const SCORE_KEYS: Record<AiCategory, "cleanlinessScore" | "maintenanceScore" | "safetyScore" | "consumablesScore" | null> = {
  cleanliness: "cleanlinessScore",
  maintenance: "maintenanceScore",
  safety: "safetyScore",
  consumables: "consumablesScore",
  presentation: null, // folded into the overall score rather than tracked separately
};

export const SEVERITY_WEIGHT: Record<AiSeverity, number> = {
  CRITICAL: 40, HIGH: 20, MEDIUM: 8, LOW: 3,
};

export function isCategory(x: string): x is AiCategory {
  return (AI_CATEGORIES as readonly string[]).includes(x);
}

export function isSeverity(x: string): x is AiSeverity {
  return (AI_SEVERITIES as readonly string[]).includes(x);
}

// Condition band from a 0–100 score.
export function conditionFromScore(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 55) return "fair";
  if (score >= 35) return "poor";
  return "critical";
}
