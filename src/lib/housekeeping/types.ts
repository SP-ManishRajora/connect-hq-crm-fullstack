// Shared types + error helper for the housekeeping service layer.
// Mirrors src/lib/occupancy/types.ts so both modules behave identically at the
// route boundary.

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function toErrorResponse(e: unknown): { status: number; error: string } {
  if (e instanceof HttpError) return { status: e.status, error: e.message };
  console.error("housekeeping service error:", e);
  return { status: 500, error: "Internal error" };
}

// Verification flags raised during a scan/submit. Recorded on the visit rather
// than blocking it — except GEOFENCE_FAIL when the centre is configured to
// reject. Managers triage the rest.
export const VISIT_FLAGS = {
  GEOFENCE_FAIL: "GEOFENCE_FAIL",           // outside the permitted radius
  GEOFENCE_UNVERIFIED: "GEOFENCE_UNVERIFIED", // location has no saved GPS point
  NO_GPS: "NO_GPS",                          // device gave no position
  POOR_GPS_ACCURACY: "POOR_GPS_ACCURACY",
  TOO_FAST: "TOO_FAST",                      // submitted under minDwellSeconds
  IMPOSSIBLE_MOVEMENT: "IMPOSSIBLE_MOVEMENT", // speed between visits implausible
  RAPID_RESCAN: "RAPID_RESCAN",              // two scans unrealistically close together
  DEVICE_SWITCH: "DEVICE_SWITCH",            // different device mid-round
  DUPLICATE_PHOTO: "DUPLICATE_PHOTO",
  GALLERY_UPLOAD: "GALLERY_UPLOAD",          // manager exception, always visible
  PHOTO_TIME_MISMATCH: "PHOTO_TIME_MISMATCH", // device capture time far from server time
  INCOMPLETE_PHOTOS: "INCOMPLETE_PHOTOS",
  OFFLINE_CAPTURED: "OFFLINE_CAPTURED",      // captured with no signal; server time not witnessed
} as const;

export type VisitFlag = (typeof VISIT_FLAGS)[keyof typeof VISIT_FLAGS];

export const FLAG_LABELS: Record<string, string> = {
  GEOFENCE_FAIL: "Outside permitted radius",
  GEOFENCE_UNVERIFIED: "Location has no saved GPS point",
  NO_GPS: "No GPS position provided",
  POOR_GPS_ACCURACY: "Poor GPS accuracy",
  TOO_FAST: "Completed faster than the minimum time",
  IMPOSSIBLE_MOVEMENT: "Implausible travel speed between areas",
  RAPID_RESCAN: "Scans unrealistically close together",
  DEVICE_SWITCH: "Device changed mid-round",
  DUPLICATE_PHOTO: "Duplicate photograph detected",
  GALLERY_UPLOAD: "Gallery upload (camera bypassed)",
  PHOTO_TIME_MISMATCH: "Photo capture time differs from server time",
  INCOMPLETE_PHOTOS: "Fewer photographs than required",
  OFFLINE_CAPTURED: "Captured offline — time reported by the device",
};

// Default photo angles when a location doesn't define its own.
export const DEFAULT_ANGLES = [
  "Entrance / full area",
  "Left side",
  "Right side",
  "Close-up / critical point",
];

export const CATEGORY_ANGLES: Record<string, string[]> = {
  BATHROOM: ["Washbasin & mirror", "Toilet / urinal area", "Floor & drainage", "Consumables & dustbin"],
  COMMON_AREA: ["Full room view", "Tables & workstations", "Floor & corners", "Dustbins / pantry area"],
  PARKING: ["Entry view", "Left bay", "Right bay", "Floor & corners"],
  GENERATOR_AREA: ["Full generator view", "Control panel", "Fuel tank / gauge", "Surrounding floor"],
  FUEL_TANK: ["Full tank view", "Fuel gauge close-up", "Tank base / leakage check", "Surrounding area"],
  ELECTRICITY_ROOM: ["Full room view", "Main panel", "Wiring / cable tray", "Floor & storage"],
};

export function anglesForCategory(category: string): string[] {
  return CATEGORY_ANGLES[category] ?? DEFAULT_ANGLES;
}

export function parseJsonArray(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
