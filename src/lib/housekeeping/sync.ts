import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { VISIT_FLAGS } from "./types";
import { mergeFlags, verifyScan } from "./verification";
import { resolveForInspection } from "./qr-resolve";
import { getHkConfig } from "./settings";
import { assertDeviceAllowed, touchDevice } from "./devices";
import type { SessionUser } from "@/lib/auth";

// Offline sync for the Android staff app.
//
// WHY THIS IS A SEPARATE ENDPOINT
// -------------------------------
// POST /api/housekeeping/visits states, and enforces, that server time is
// authoritative and `scannedAt` is never taken from the client. Offline capture
// cannot satisfy that — the whole point is that no server was reachable at the
// moment of capture. Rather than loosening the online rule (which would silently
// weaken every inspection ever taken), offline visits come through here and are
// recorded as a visibly different, weaker class of evidence:
//
//   * `offlineCaptured = true` and the OFFLINE_CAPTURED flag, so reports, the
//     supervisor view and the audit trail all show that server time was not
//     witnessed
//   * `capturedAt` holds what the DEVICE claimed — recorded, never trusted
//   * `scannedAt` still comes from the server, and here means "when it synced"
//
// Every other check still runs unchanged: geofence, device revocation, QR
// resolution, centre ownership and round ownership. Offline relaxes the clock,
// nothing else.

export const offlineVisitSchema = z.object({
  clientVisitId: z.string().min(8).max(64), // app-generated, makes retries idempotent
  roundId: z.string().min(1),
  code: z.string().min(1).max(64),
  capturedAt: z.string().datetime(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  accuracyM: z.number().min(0).max(100000).nullish(),
  deviceId: z.string().max(120).nullish(),
  dwellSeconds: z.number().int().min(0).max(86400).nullish(),
  observations: z.string().max(2000).nullish(),
});

export const syncSchema = z.object({
  visits: z.array(offlineVisitSchema).max(50),
});

export type SyncItemResult = {
  clientVisitId: string;
  status: "SYNCED" | "DUPLICATE" | "REJECTED";
  visitId?: string;
  flags?: string[];
  error?: string;
};

/**
 * Drain one queued visit.
 *
 * Never throws: a single bad item must not sink the whole batch, because the app
 * cannot selectively retry what it cannot tell apart. Every item comes back with
 * its own verdict and the app clears exactly the ones the server accepted.
 */
export async function syncOneVisit(
  u: SessionUser,
  item: z.infer<typeof offlineVisitSchema>,
): Promise<SyncItemResult> {
  const fail = (error: string): SyncItemResult => ({
    clientVisitId: item.clientVisitId,
    status: "REJECTED",
    error,
  });

  try {
    // Idempotent replay: the app retries a batch it never saw acknowledged, so
    // an already-synced id returns its existing visit rather than duplicating.
    const existing = await prisma.inspectionVisit.findUnique({
      where: { clientVisitId: item.clientVisitId },
      select: { id: true, userId: true, flags: true },
    });
    if (existing) {
      if (existing.userId !== u.id) return fail("This visit belongs to another user");
      return {
        clientVisitId: item.clientVisitId,
        status: "DUPLICATE",
        visitId: existing.id,
        flags: existing.flags ? (JSON.parse(existing.flags) as string[]) : [],
      };
    }

    // A device revoked while it was offline must not be able to drain its queue.
    // This is the main reason revocation exists, so it is checked before anything
    // is written — not after. Uses the shared helper so the `blockRevokedDevices`
    // setting is honoured exactly as it is on the online path.
    await assertDeviceAllowed(u.id, item.deviceId);

    const round = await prisma.inspectionRound.findUnique({ where: { id: item.roundId } });
    if (!round) return fail("Round not found");
    if (round.userId !== u.id) return fail("This is not your round");

    const resolved = await resolveForInspection(item.code);
    if (!resolved) return fail("Unrecognised QR code");

    const loc = await prisma.inspectionLocation.findUnique({
      where: { id: resolved.locationId },
    });
    if (!loc) return fail("Unrecognised QR code");
    if (loc.deletedAt || !loc.active) return fail("This location is no longer inspected");
    if (loc.centerId !== round.centerId) {
      return fail("This QR belongs to a different centre than the round");
    }

    const cfg = await getHkConfig();
    const verdict = await verifyScan(
      round.id,
      { id: loc.id, lat: loc.lat, lng: loc.lng, geofenceRadiusM: loc.geofenceRadiusM },
      { lat: item.lat, lng: item.lng, accuracyM: item.accuracyM, deviceId: item.deviceId },
      cfg,
    );

    // An offline visit is never auto-rejected on geofence, even where the online
    // path would reject: the supervisor already did the work and cannot be sent
    // back. The failure is recorded as a flag for a human to judge instead.
    const flags = mergeFlags(
      verdict.flags.length ? JSON.stringify(verdict.flags) : null,
      [VISIT_FLAGS.OFFLINE_CAPTURED],
    );

    const now = new Date();
    const visit = await prisma.inspectionVisit.create({
      data: {
        roundId: round.id,
        locationId: loc.id,
        qrCodeId: resolved.staffQrCodeId,
        userId: u.id,
        clientVisitId: item.clientVisitId,
        sequence:
          ((
            await prisma.inspectionVisit.findFirst({
              where: { roundId: round.id },
              orderBy: { sequence: "desc" },
              select: { sequence: true },
            })
          )?.sequence ?? 0) + 1,
        deviceId: item.deviceId ?? null,
        lat: item.lat ?? null,
        lng: item.lng ?? null,
        gpsAccuracyM: item.accuracyM ?? null,
        distanceM: verdict.distanceM,
        geofenceOk: verdict.geofenceOk,
        dwellSeconds: item.dwellSeconds ?? null,
        observations: item.observations ?? null,
        flags,
        // The clock distinction, made explicit in the row itself.
        capturedAt: new Date(item.capturedAt),
        syncedAt: now,
        offlineCaptured: true,
      },
      select: { id: true },
    });

    if (item.deviceId) await touchDevice(u.id, item.deviceId);

    await logAction({
      userId: u.id,
      action: "HK_VISIT_SYNCED_OFFLINE",
      targetType: "InspectionVisit",
      targetId: visit.id,
      meta: {
        locationId: loc.id,
        locationName: loc.name,
        capturedAt: item.capturedAt,
        syncedAt: now.toISOString(),
        // How far the device's claim was from arrival — the number a reviewer
        // actually wants when judging an offline visit.
        delayMinutes: Math.round((now.getTime() - new Date(item.capturedAt).getTime()) / 60000),
        deviceId: item.deviceId ?? null,
        flags: flags ? JSON.parse(flags) : [],
      },
    });

    return {
      clientVisitId: item.clientVisitId,
      status: "SYNCED",
      visitId: visit.id,
      flags: flags ? (JSON.parse(flags) as string[]) : [],
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Sync failed");
  }
}
