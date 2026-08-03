// Presence-verification engine.
//
// Design rule: verification FLAGS, it does not silently discard. The only hard
// rejection is an out-of-geofence scan when the admin has switched
// `rejectOutsideGeofence` on. Everything else is recorded on the visit so a
// manager can triage — a supervisor standing in a basement with bad GPS must
// still be able to complete an honest inspection.

import { prisma } from "@/lib/db";
import { haversineM, impliedSpeedKmh, isValidLatLng } from "./geo";
import { VISIT_FLAGS, type VisitFlag } from "./types";
import type { HkConfig } from "./settings";

export type ScanInput = {
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  deviceId?: string | null;
};

export type ScanVerdict = {
  flags: VisitFlag[];
  distanceM: number | null;
  geofenceOk: boolean;
  reject: boolean;
  rejectReason?: string;
};

export async function verifyScan(
  roundId: string,
  location: {
    id: string;
    lat: number | null;
    lng: number | null;
    geofenceRadiusM: number;
  },
  input: ScanInput,
  cfg: HkConfig,
): Promise<ScanVerdict> {
  const flags: VisitFlag[] = [];
  let distanceM: number | null = null;
  let geofenceOk = false;

  // --- Geofence ---
  const hasDevicePos = isValidLatLng(input.lat, input.lng);
  const hasLocationPos = isValidLatLng(location.lat, location.lng);

  if (!hasDevicePos) {
    flags.push(VISIT_FLAGS.NO_GPS);
  } else if (!hasLocationPos) {
    // Location was never geo-tagged — can't verify, so flag instead of punishing.
    flags.push(VISIT_FLAGS.GEOFENCE_UNVERIFIED);
  } else {
    distanceM = haversineM(input.lat!, input.lng!, location.lat!, location.lng!);
    // Allow the device's own accuracy as slack, so a ±30 m fix at the boundary
    // isn't a false accusation.
    const slack = Math.min(input.accuracyM ?? 0, cfg.maxGpsAccuracyM);
    geofenceOk = distanceM <= location.geofenceRadiusM + slack;
    if (!geofenceOk) flags.push(VISIT_FLAGS.GEOFENCE_FAIL);
  }

  if (
    typeof input.accuracyM === "number" &&
    input.accuracyM > cfg.maxGpsAccuracyM
  ) {
    flags.push(VISIT_FLAGS.POOR_GPS_ACCURACY);
  }

  // --- Movement + cadence against the previous visit in this round ---
  const prev = await prisma.inspectionVisit.findFirst({
    where: { roundId },
    orderBy: { sequence: "desc" },
    select: {
      scannedAt: true,
      lat: true,
      lng: true,
      deviceId: true,
    },
  });

  if (prev) {
    const gapSec = (Date.now() - prev.scannedAt.getTime()) / 1000;

    if (gapSec < cfg.minSecondsBetweenScans) {
      flags.push(VISIT_FLAGS.RAPID_RESCAN);
    }

    if (hasDevicePos && isValidLatLng(prev.lat, prev.lng)) {
      const moved = haversineM(prev.lat!, prev.lng!, input.lat!, input.lng!);
      const speed = impliedSpeedKmh(moved, gapSec);
      if (speed !== null && speed > cfg.maxTravelSpeedKmh) {
        flags.push(VISIT_FLAGS.IMPOSSIBLE_MOVEMENT);
      }
    }

    if (input.deviceId && prev.deviceId && input.deviceId !== prev.deviceId) {
      flags.push(VISIT_FLAGS.DEVICE_SWITCH);
    }
  }

  const reject = cfg.rejectOutsideGeofence && flags.includes(VISIT_FLAGS.GEOFENCE_FAIL);

  return {
    flags,
    distanceM,
    geofenceOk,
    reject,
    rejectReason: reject
      ? `You appear to be ${Math.round(distanceM ?? 0)} m from this area (allowed: ${location.geofenceRadiusM} m). Move closer and scan again.`
      : undefined,
  };
}

// Checked at submit time, once dwell is known.
export function verifyDwell(
  scannedAt: Date,
  minDwellSeconds: number,
): { dwellSeconds: number; flags: VisitFlag[] } {
  const dwellSeconds = Math.max(0, Math.round((Date.now() - scannedAt.getTime()) / 1000));
  const flags: VisitFlag[] = [];
  if (dwellSeconds < minDwellSeconds) flags.push(VISIT_FLAGS.TOO_FAST);
  return { dwellSeconds, flags };
}

export function mergeFlags(existing: string | null, added: VisitFlag[]): string | null {
  const prev: string[] = existing ? safeParse(existing) : [];
  const merged = Array.from(new Set([...prev, ...added]));
  return merged.length ? JSON.stringify(merged) : null;
}

function safeParse(v: string): string[] {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
