import { z } from "zod";

export const CATEGORIES = [
  "BATHROOM", "COMMON_AREA", "PARKING", "FRONT_AREA", "BACK_AREA",
  "GUARD_ROOM", "ELECTRICITY_ROOM", "GENERATOR_AREA", "FUEL_TANK",
  "PANTRY", "MEETING_ROOM", "RECEPTION", "OTHER",
] as const;

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const createLocationSchema = z.object({
  centerId: z.string().min(1),
  floorId: z.string().min(1).nullish(),
  name: z.string().min(1).max(120),
  category: z.enum(CATEGORIES).default("OTHER"),
  lat: lat.nullish(),
  lng: lng.nullish(),
  geofenceRadiusM: z.number().int().min(5).max(2000).default(50),
  requiredPhotoCount: z.number().int().min(1).max(8).default(4),
  requiredAngles: z.array(z.string().min(1).max(80)).max(8).nullish(),
  checklist: z.array(z.string().min(1).max(200)).max(50).nullish(),
  minDwellSeconds: z.number().int().min(0).max(3600).default(60),
  frequencyPerDay: z.number().int().min(0).max(24).default(1),
  priority: z.enum(PRIORITIES).default("NORMAL"),
});

export const updateLocationSchema = createLocationSchema
  .partial()
  .omit({ centerId: true })
  .extend({ active: z.boolean().optional() });

export const reorderSchema = z.object({
  centerId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const startRoundSchema = z.object({
  centerId: z.string().min(1),
  notes: z.string().max(500).nullish(),
});

export const scanSchema = z.object({
  roundId: z.string().min(1),
  code: z.string().min(1).max(64),
  lat: lat.nullish(),
  lng: lng.nullish(),
  accuracyM: z.number().min(0).max(100000).nullish(),
  deviceId: z.string().max(120).nullish(),
});

export const submitVisitSchema = z.object({
  observations: z.string().max(2000).nullish(),
});

// --- Issues & corrective actions (Phase 6) ---------------------------------

export const SEVERITY = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const ISSUE_CATEGORY = [
  "cleanliness", "maintenance", "safety", "consumables", "presentation",
] as const;

export const createIssueSchema = z.object({
  centerId: z.string().min(1),
  locationId: z.string().min(1).nullish(),
  visitId: z.string().min(1).nullish(),
  category: z.enum(ISSUE_CATEGORY),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).nullish(),
  severity: z.enum(SEVERITY).default("MEDIUM"),
  beforePhotoId: z.string().min(1).nullish(),
  assigneeId: z.string().min(1).nullish(),
  source: z.enum(["INSPECTION", "MANUAL"]).default("MANUAL"),
});

export const assignIssueSchema = z.object({
  assigneeId: z.string().min(1).nullable(),
  severity: z.enum(SEVERITY).optional(), // re-triage on assignment
});

export const completeActionSchema = z.object({
  afterPhotoId: z.string().min(1).nullish(),
  notes: z.string().max(2000).nullish(),
  unableReason: z.string().max(2000).nullish(),
});

export const verifyIssueSchema = z.object({
  verdict: z.enum(["PASS", "FAIL"]),
  notes: z.string().max(2000).nullish(),
});

export const gpsPingSchema = z.object({
  roundId: z.string().min(1),
  lat,
  lng,
  accuracyM: z.number().min(0).max(100000).nullish(),
});
