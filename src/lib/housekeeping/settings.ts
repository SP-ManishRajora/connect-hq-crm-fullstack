// Typed config over the HkSetting key/value table, with defaults so the module
// works before an admin ever opens the setup screen.

import { prisma } from "@/lib/db";

export type HkConfig = {
  // Reject a scan outside the geofence, or accept-and-flag it for triage.
  rejectOutsideGeofence: boolean;
  // GPS accuracy worse than this is treated as unreliable.
  maxGpsAccuracyM: number;
  // Implied travel speed above this between two visits is physically implausible.
  maxTravelSpeedKmh: number;
  // Two scans closer together than this are suspicious.
  minSecondsBetweenScans: number;
  // Device capture time this far from server time is suspicious.
  maxPhotoClockSkewSeconds: number;
  // Allow managers to upload from the gallery (always flagged when they do).
  allowGalleryForManagers: boolean;
};

export const HK_DEFAULTS: HkConfig = {
  rejectOutsideGeofence: false,
  maxGpsAccuracyM: 100,
  maxTravelSpeedKmh: 80,
  minSecondsBetweenScans: 20,
  maxPhotoClockSkewSeconds: 15 * 60,
  allowGalleryForManagers: true,
};

const CONFIG_KEY = "inspection.config";

export async function getHkConfig(): Promise<HkConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: CONFIG_KEY } });
    if (!row) return HK_DEFAULTS;
    const parsed = JSON.parse(row.value) as Partial<HkConfig>;
    return { ...HK_DEFAULTS, ...parsed };
  } catch {
    // A malformed or unreachable setting must never break an inspection.
    return HK_DEFAULTS;
  }
}

// --- Issue / corrective-action config (Phase 6) ----------------------------

export type IssueConfig = {
  // Hours from creation to due, per severity. Admin-tunable per the brief §10.
  slaHours: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW", number>;
  // Require an "after" photograph before work can be submitted.
  requireAfterPhoto: boolean;
  // Default assignee per centre, keyed by centreId → userId. Optional.
  defaultAssigneeByCenter: Record<string, string>;
};

export const ISSUE_DEFAULTS: IssueConfig = {
  slaHours: { CRITICAL: 2, HIGH: 8, MEDIUM: 24, LOW: 72 },
  requireAfterPhoto: true,
  defaultAssigneeByCenter: {},
};

const ISSUE_KEY = "issues.config";

export async function getIssueConfig(): Promise<IssueConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: ISSUE_KEY } });
    if (!row) return ISSUE_DEFAULTS;
    const parsed = JSON.parse(row.value) as Partial<IssueConfig>;
    return {
      ...ISSUE_DEFAULTS,
      ...parsed,
      slaHours: { ...ISSUE_DEFAULTS.slaHours, ...(parsed.slaHours ?? {}) },
      defaultAssigneeByCenter: parsed.defaultAssigneeByCenter ?? {},
    };
  } catch {
    return ISSUE_DEFAULTS;
  }
}

export async function setIssueConfig(patch: Partial<IssueConfig>): Promise<IssueConfig> {
  const current = await getIssueConfig();
  const next: IssueConfig = {
    ...current,
    ...patch,
    slaHours: { ...current.slaHours, ...(patch.slaHours ?? {}) },
    defaultAssigneeByCenter: patch.defaultAssigneeByCenter ?? current.defaultAssigneeByCenter,
  };
  await prisma.hkSetting.upsert({
    where: { key: ISSUE_KEY },
    create: { key: ISSUE_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

// --- Generator monitoring config (Phase 7) ---------------------------------
// Every tolerance in the brief §11 is admin-tunable from here.

export type GeneratorConfig = {
  // Fuel may drift this much between readings without a run or refill before
  // it is treated as unexplained (gauge slosh, temperature, reading error).
  fuelToleranceL: number;
  // Hour-meter movement below this is treated as noise.
  hourToleranceH: number;
  // OCR vs operator-typed reading mismatch beyond this raises a discrepancy.
  ocrMismatchFuelL: number;
  ocrMismatchHourH: number;
  // A claimed ON/OFF time this far from server time counts as backdating.
  backdateToleranceMin: number;
  // Consumption above the generator's normal L/h range by this factor is "unusual".
  consumptionOverrunFactor: number;
  // Two readings within this window that disagree = conflicting entries.
  conflictWindowMin: number;
};

export const GENERATOR_DEFAULTS: GeneratorConfig = {
  fuelToleranceL: 5,
  hourToleranceH: 0.1,
  ocrMismatchFuelL: 10,
  ocrMismatchHourH: 1,
  backdateToleranceMin: 15,
  consumptionOverrunFactor: 1.5,
  conflictWindowMin: 10,
};

const GEN_KEY = "generator.config";

export async function getGeneratorConfig(): Promise<GeneratorConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: GEN_KEY } });
    if (!row) return GENERATOR_DEFAULTS;
    return { ...GENERATOR_DEFAULTS, ...(JSON.parse(row.value) as Partial<GeneratorConfig>) };
  } catch {
    return GENERATOR_DEFAULTS;
  }
}

export async function setGeneratorConfig(patch: Partial<GeneratorConfig>): Promise<GeneratorConfig> {
  const current = await getGeneratorConfig();
  const next = { ...current, ...patch };
  await prisma.hkSetting.upsert({
    where: { key: GEN_KEY },
    create: { key: GEN_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

// --- Efficiency scoring config (Phase 8) -----------------------------------
// The brief's example weighting is 30/20/15/15/10/10. Ours maps onto the five
// factors we can actually measure today; weights are admin-tunable and are
// renormalised at scoring time, so they need not sum to exactly 1.

export type EfficiencyConfig = {
  weights: {
    sla: number;        // rectification within due time
    quality: number;    // accepted without rework
    completion: number; // assigned work finished
    evidence: number;   // after-photograph supplied
    severity: number;   // critical/high handled on time
  };
};

export const EFFICIENCY_DEFAULTS: EfficiencyConfig = {
  weights: { sla: 0.30, quality: 0.25, completion: 0.20, evidence: 0.15, severity: 0.10 },
};

const EFF_KEY = "efficiency.config";

export async function getEfficiencyConfig(): Promise<EfficiencyConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: EFF_KEY } });
    if (!row) return EFFICIENCY_DEFAULTS;
    const parsed = JSON.parse(row.value) as Partial<EfficiencyConfig>;
    return { weights: { ...EFFICIENCY_DEFAULTS.weights, ...(parsed.weights ?? {}) } };
  } catch {
    return EFFICIENCY_DEFAULTS;
  }
}

export async function setEfficiencyConfig(patch: Partial<EfficiencyConfig>): Promise<EfficiencyConfig> {
  const current = await getEfficiencyConfig();
  const next: EfficiencyConfig = { weights: { ...current.weights, ...(patch.weights ?? {}) } };
  await prisma.hkSetting.upsert({
    where: { key: EFF_KEY },
    create: { key: EFF_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

// --- Client cleaning-request config (Phase 9) ------------------------------

export type RequestConfig = {
  /** Auto-assign on submission by lowest current workload. */
  autoAssign: boolean;
  /** Per-centre default assignee (overrides workload balancing). */
  defaultAssigneeByCenter: Record<string, string>;
  /** Require the client to confirm before closing (brief §31). */
  requireClientConfirmation: boolean;
  /** Auto-close after this many hours with no client response. */
  autoCloseAfterHours: number;
  /** Require the staff member to re-scan the area QR to complete (brief §28). */
  requireQrOnComplete: boolean;
  /** Repeat requests from one client for one area within this window are notable. */
  repeatWindowHours: number;
};

export const REQUEST_DEFAULTS: RequestConfig = {
  autoAssign: true,
  defaultAssigneeByCenter: {},
  requireClientConfirmation: false,
  autoCloseAfterHours: 24,
  requireQrOnComplete: false, // flagged rather than blocked — see D-24
  repeatWindowHours: 24,
};

const REQ_KEY = "requests.config";

export async function getRequestConfig(): Promise<RequestConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: REQ_KEY } });
    if (!row) return REQUEST_DEFAULTS;
    const parsed = JSON.parse(row.value) as Partial<RequestConfig>;
    return {
      ...REQUEST_DEFAULTS,
      ...parsed,
      defaultAssigneeByCenter: parsed.defaultAssigneeByCenter ?? {},
    };
  } catch {
    return REQUEST_DEFAULTS;
  }
}

export async function setRequestConfig(patch: Partial<RequestConfig>): Promise<RequestConfig> {
  const current = await getRequestConfig();
  const next: RequestConfig = {
    ...current,
    ...patch,
    defaultAssigneeByCenter: patch.defaultAssigneeByCenter ?? current.defaultAssigneeByCenter,
  };
  await prisma.hkSetting.upsert({
    where: { key: REQ_KEY },
    create: { key: REQ_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

// --- Retention & device policy (Phase 10) ----------------------------------

export type RetentionConfig = {
  /**
   * Days to keep the image FILE. Metadata, AI findings, scores and audit rows
   * are never purged — only the bytes on disk. 0 disables purging entirely.
   */
  photoRetentionDays: number;
  /** Report what would be deleted without deleting it. */
  dryRun: boolean;
  /** Safety valve: never delete more than this many files in one run. */
  maxDeletesPerRun: number;
  /** A revoked device is refused at scan time rather than merely flagged. */
  blockRevokedDevices: boolean;
};

export const RETENTION_DEFAULTS: RetentionConfig = {
  photoRetentionDays: 180,      // 6 months — chosen 2026-08-04, resolves D-02
  dryRun: false,
  maxDeletesPerRun: 5000,
  blockRevokedDevices: true,
};

const RETENTION_KEY = "retention.config";

export async function getRetentionConfig(): Promise<RetentionConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: RETENTION_KEY } });
    if (!row) return RETENTION_DEFAULTS;
    return { ...RETENTION_DEFAULTS, ...(JSON.parse(row.value) as Partial<RetentionConfig>) };
  } catch {
    return RETENTION_DEFAULTS;
  }
}

export async function setRetentionConfig(patch: Partial<RetentionConfig>): Promise<RetentionConfig> {
  const current = await getRetentionConfig();
  const next = { ...current, ...patch };
  await prisma.hkSetting.upsert({
    where: { key: RETENTION_KEY },
    create: { key: RETENTION_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

// --- AI analysis config (Phase 5) ------------------------------------------

export type AiConfig = {
  /** Queue analysis automatically when a photograph is uploaded. */
  autoQueue: boolean;
  /** Findings at or above this severity may become issues automatically. */
  autoIssueMinSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  /** ...and only above this confidence. The stub sits far below it by design. */
  autoIssueMinConfidence: number;
  /** Give up after this many attempts; the job is marked FAILED, never deleted. */
  maxAttempts: number;
  /** Jobs claimed per cron tick — CPU inference is slow, so keep this small. */
  batchSize: number;
  /** Admin prompt overrides; blank falls back to the defaults. */
  prompts?: { photo?: string; beforeAfter?: string; meter?: string };
};

export const AI_DEFAULTS: AiConfig = {
  autoQueue: true,
  autoIssueMinSeverity: "HIGH",
  autoIssueMinConfidence: 0.7,
  maxAttempts: 4,
  batchSize: 5,
};

const AI_KEY = "ai.config";

export async function getAiConfig(): Promise<AiConfig> {
  try {
    const row = await prisma.hkSetting.findUnique({ where: { key: AI_KEY } });
    if (!row) return AI_DEFAULTS;
    return { ...AI_DEFAULTS, ...(JSON.parse(row.value) as Partial<AiConfig>) };
  } catch {
    return AI_DEFAULTS;
  }
}

export async function setAiConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  const current = await getAiConfig();
  const next = { ...current, ...patch };
  await prisma.hkSetting.upsert({
    where: { key: AI_KEY },
    create: { key: AI_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export async function setHkConfig(patch: Partial<HkConfig>): Promise<HkConfig> {
  const current = await getHkConfig();
  const next = { ...current, ...patch };
  await prisma.hkSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}
