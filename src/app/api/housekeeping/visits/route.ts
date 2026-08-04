import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
} from "@/lib/housekeeping/route-helpers";
import { scanSchema } from "@/lib/housekeeping/validators";
import { verifyScan, mergeFlags } from "@/lib/housekeeping/verification";
import { getHkConfig } from "@/lib/housekeeping/settings";
import { anglesForCategory, parseJsonArray } from "@/lib/housekeeping/types";
import { assertDeviceAllowed, touchDevice } from "@/lib/housekeeping/devices";

// POST /api/housekeeping/visits — scan a location QR and open a visit.
//
// Server time is authoritative: `scannedAt` defaults to now() in the database
// and is never taken from the client, so a device with a shifted clock cannot
// move an inspection's timestamp.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(scanSchema, await req.json());

    // Phase 10 — a revoked device is refused before anything is written, so a
    // rejected scan leaves no partial visit behind.
    await assertDeviceAllowed(u.id, body.deviceId);

    const cfg = await getHkConfig();

    const round = await prisma.inspectionRound.findUnique({
      where: { id: body.roundId },
    });
    if (!round) throw Object.assign(new Error("Round not found"), { __status: 404 });
    if (round.userId !== u.id) {
      throw Object.assign(new Error("This is not your round"), { __status: 403 });
    }
    if (round.status !== "IN_PROGRESS") {
      throw Object.assign(new Error("This round is already closed"), { __status: 400 });
    }

    // Resolve the QR server-side. An inactive code means a retired printout.
    const qr = await prisma.locationQrCode.findUnique({
      where: { code: body.code },
      include: { location: true },
    });
    if (!qr) throw Object.assign(new Error("Unrecognised QR code"), { __status: 404 });
    if (!qr.active) {
      throw Object.assign(
        new Error("This QR code has been retired. Ask an admin for the current printout."),
        { __status: 410 },
      );
    }

    const loc = qr.location;
    if (loc.deletedAt || !loc.active) {
      throw Object.assign(new Error("This location is no longer inspected"), { __status: 410 });
    }
    if (loc.centerId !== round.centerId) {
      throw Object.assign(
        new Error("This QR belongs to a different centre than your active round"),
        { __status: 400 },
      );
    }

    // Resume an already-open visit rather than creating a duplicate row when a
    // supervisor re-scans the same area (e.g. after the app is backgrounded).
    const openVisit = await prisma.inspectionVisit.findFirst({
      where: { roundId: round.id, locationId: loc.id, status: "SCANNED" },
      include: { photos: { select: { id: true, slot: true, angle: true } } },
    });

    const verdict = await verifyScan(
      round.id,
      { id: loc.id, lat: loc.lat, lng: loc.lng, geofenceRadiusM: loc.geofenceRadiusM },
      body,
      cfg,
    );

    if (verdict.reject) {
      await logAction({
        userId: u.id,
        action: "HK_SCAN_REJECTED",
        targetType: "InspectionLocation",
        targetId: loc.id,
        meta: { roundId: round.id, distanceM: verdict.distanceM, flags: verdict.flags },
      });
      return NextResponse.json(
        { error: verdict.rejectReason, flags: verdict.flags, distanceM: verdict.distanceM },
        { status: 422 },
      );
    }

    const angles = parseJsonArray(loc.requiredAngles);
    const requiredAngles = (angles.length ? angles : anglesForCategory(loc.category)).slice(
      0,
      loc.requiredPhotoCount,
    );

    let visit = openVisit;
    if (visit) {
      visit = await prisma.inspectionVisit.update({
        where: { id: visit.id },
        data: { flags: mergeFlags(visit.flags, verdict.flags) },
        include: { photos: { select: { id: true, slot: true, angle: true } } },
      });
    } else {
      const last = await prisma.inspectionVisit.findFirst({
        where: { roundId: round.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });

      visit = await prisma.inspectionVisit.create({
        data: {
          roundId: round.id,
          locationId: loc.id,
          qrCodeId: qr.id,
          userId: u.id,
          sequence: (last?.sequence ?? 0) + 1,
          deviceId: body.deviceId ?? null,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          gpsAccuracyM: body.accuracyM ?? null,
          distanceM: verdict.distanceM,
          geofenceOk: verdict.geofenceOk,
          flags: verdict.flags.length ? JSON.stringify(verdict.flags) : null,
        },
        include: { photos: { select: { id: true, slot: true, angle: true } } },
      });

      // Track the device so rapid switching is detectable across rounds.
      // touchDevice never clears `revokedAt` — re-registering cannot undo a revocation.
      if (body.deviceId) await touchDevice(u.id, body.deviceId);

      await logAction({
        userId: u.id,
        action: "HK_LOCATION_SCANNED",
        targetType: "InspectionVisit",
        targetId: visit.id,
        meta: {
          locationId: loc.id,
          locationName: loc.name,
          distanceM: verdict.distanceM,
          geofenceOk: verdict.geofenceOk,
          flags: verdict.flags,
        },
      });
    }

    return NextResponse.json({
      visit,
      location: {
        id: loc.id,
        name: loc.name,
        category: loc.category,
        requiredPhotoCount: loc.requiredPhotoCount,
        minDwellSeconds: loc.minDwellSeconds,
        checklist: parseJsonArray(loc.checklist),
      },
      requiredAngles,
      flags: verdict.flags,
      distanceM: verdict.distanceM,
      geofenceOk: verdict.geofenceOk,
    });
  } catch (e) {
    return handleError(e);
  }
}
