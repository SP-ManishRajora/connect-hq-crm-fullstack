import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { requireModule, isResponse, handleError } from "@/lib/housekeeping/route-helpers";
import {
  sniffImageMime,
  isAllowedMime,
  sha256Hex,
  storePhoto,
} from "@/lib/housekeeping/storage";
import { isValidPhash, isNearDuplicate } from "@/lib/housekeeping/phash";
import { VISIT_FLAGS } from "@/lib/housekeeping/types";
import { mergeFlags } from "@/lib/housekeeping/verification";
import { getHkConfig } from "@/lib/housekeeping/settings";
import { assertDeviceAllowed } from "@/lib/housekeeping/devices";
import { queuePhotoAnalysis } from "@/lib/housekeeping/ai/jobs";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — generous for a phone photo

// POST /api/housekeeping/photos  (multipart/form-data)
//   file, visitId, slot, angle, captureAt?, lat?, lng?, deviceId?, pHash?, source?
//
// Deliberately NOT the generic /api/upload route: that writes into public/ and
// is world-readable by URL. Inspection evidence goes to private storage and is
// only served through a signed, role-checked route.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    // The Android app queues photos offline against its OWN visit id, because
    // the server id does not exist until the visit syncs. Either identifier is
    // accepted; the client one is resolved to the real visit below.
    const clientVisitId = String(form.get("clientVisitId") || "");
    let visitId = String(form.get("visitId") || "");
    if (!visitId && clientVisitId) {
      const owner = await prisma.inspectionVisit.findUnique({
        where: { clientVisitId },
        select: { id: true },
      });
      if (!owner) {
        throw Object.assign(
          new Error("That visit has not been synced yet — sync visits before photographs"),
          { __status: 409 },
        );
      }
      visitId = owner.id;
    }
    const slot = Number(form.get("slot") ?? -1);
    const angle = String(form.get("angle") || "").slice(0, 80);

    if (!file) throw Object.assign(new Error("No file provided"), { __status: 400 });
    if (!visitId) throw Object.assign(new Error("visitId is required"), { __status: 400 });
    if (!Number.isInteger(slot) || slot < 0 || slot > 7) {
      throw Object.assign(new Error("Invalid photo slot"), { __status: 400 });
    }
    if (file.size > MAX_BYTES) {
      throw Object.assign(new Error("Photograph is too large (max 12 MB)"), { __status: 413 });
    }

    const visit = await prisma.inspectionVisit.findUnique({
      where: { id: visitId },
      include: { round: true, location: true },
    });
    if (!visit) throw Object.assign(new Error("Visit not found"), { __status: 404 });
    if (visit.userId !== u.id) {
      throw Object.assign(new Error("This is not your inspection"), { __status: 403 });
    }
    if (visit.status !== "SCANNED") {
      throw Object.assign(new Error("This location is already submitted"), { __status: 400 });
    }

    // A revoked device must not be able to attach photos to a visit it opened
    // before revocation.
    await assertDeviceAllowed(u.id, (form.get("deviceId") as string) || null);

    const buf = Buffer.from(await file.arrayBuffer());

    // Verify by magic bytes — never trust the client-declared type.
    const mime = sniffImageMime(buf);
    if (!isAllowedMime(mime)) {
      throw Object.assign(
        new Error("Only JPEG, PNG or WebP photographs are accepted"),
        { __status: 415 },
      );
    }

    const cfg = await getHkConfig();
    const flags: string[] = [];

    // Gallery uploads are a manager-only exception and are always visibly flagged.
    const source = String(form.get("source") || "CAMERA") === "GALLERY" ? "GALLERY" : "CAMERA";
    if (source === "GALLERY") {
      const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);
      if (!cfg.allowGalleryForManagers || !isManager) {
        throw Object.assign(
          new Error("Photographs must be captured live through the camera"),
          { __status: 403 },
        );
      }
      flags.push(VISIT_FLAGS.GALLERY_UPLOAD);
    }

    // --- Duplicate detection -------------------------------------------------
    // sha256 over the real bytes is authoritative and server-computed.
    const sha256 = sha256Hex(buf);
    const exact = await prisma.inspectionPhoto.findFirst({
      where: { sha256 },
      select: { id: true, locationId: true, createdAt: true, location: { select: { name: true } } },
    });

    // pHash is client-supplied (no server image decoder in this stack), so it is
    // treated as a soft signal only — see lib/housekeeping/phash.ts.
    const rawPhash = String(form.get("pHash") || "");
    const pHash = isValidPhash(rawPhash) ? rawPhash.toLowerCase() : null;

    let nearDup: { id: string; locationName: string } | null = null;
    if (!exact && pHash) {
      const recent = await prisma.inspectionPhoto.findMany({
        where: { pHash: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, pHash: true, location: { select: { name: true } } },
      });
      const hit = recent.find((r) => r.pHash && isNearDuplicate(r.pHash, pHash));
      if (hit) nearDup = { id: hit.id, locationName: hit.location.name };
    }

    if (exact || nearDup) flags.push(VISIT_FLAGS.DUPLICATE_PHOTO);

    // Device capture time vs server time.
    const captureRaw = String(form.get("captureAt") || "");
    const captureAt = captureRaw ? new Date(captureRaw) : null;
    const validCapture = captureAt && !Number.isNaN(captureAt.getTime()) ? captureAt : null;
    // On an ONLINE visit a large gap between the device's capture time and server
    // time is a tamper signal. On an offline-captured visit it is the expected
    // case — the queue may sit for hours — and flagging it would bury the real
    // signal (OFFLINE_CAPTURED, already on the visit) under noise.
    if (validCapture && !visit.offlineCaptured) {
      const skew = Math.abs(Date.now() - validCapture.getTime()) / 1000;
      if (skew > cfg.maxPhotoClockSkewSeconds) flags.push(VISIT_FLAGS.PHOTO_TIME_MISMATCH);
    }

    // Replacing a retake in the same slot: retire the old row rather than
    // deleting it, so the original evidence is never destroyed.
    const prior = await prisma.inspectionPhoto.findFirst({
      where: { visitId, slot },
    });

    const relPath = await storePhoto(visitId, slot, buf, mime!);
    const num = (v: FormDataEntryValue | null) => {
      const n = Number(v);
      return v !== null && v !== "" && Number.isFinite(n) ? n : null;
    };

    const photo = await prisma.inspectionPhoto.create({
      data: {
        visitId,
        locationId: visit.locationId,
        userId: u.id,
        angle: angle || `Photo ${slot + 1}`,
        slot,
        filePath: relPath,
        mimeType: mime!,
        sizeBytes: buf.length,
        captureAt: validCapture,
        lat: num(form.get("lat")),
        lng: num(form.get("lng")),
        deviceId: (form.get("deviceId") as string) || null,
        sha256,
        pHash,
        qualityScore: num(form.get("qualityScore")),
        source: source as any,
        retakeReason: prior ? String(form.get("retakeReason") || "Retake") : null,
        flags: flags.length ? JSON.stringify(flags) : null,
      },
    });

    // Propagate photo-level flags onto the visit so triage sees them in one place.
    if (flags.length) {
      await prisma.inspectionVisit.update({
        where: { id: visitId },
        data: { flags: mergeFlags(visit.flags, flags as any) },
      });
    }

    // Phase 5 — queue analysis AFTER the photo is safely stored. queuePhotoAnalysis
    // swallows its own errors: the evidence is already saved and an AI outage
    // must never fail an upload (brief §6, acceptance #20).
    await queuePhotoAnalysis(photo.id, visit.round.centerId);

    await logAction({
      userId: u.id,
      action: "HK_PHOTO_UPLOADED",
      targetType: "InspectionPhoto",
      targetId: photo.id,
      meta: {
        visitId, slot, source,
        duplicateOf: exact?.id ?? nearDup?.id ?? null,
        flags,
      },
    });

    return NextResponse.json(
      {
        id: photo.id,
        slot: photo.slot,
        angle: photo.angle,
        flags,
        duplicate: exact
          ? { kind: "EXACT", locationName: exact.location.name }
          : nearDup
            ? { kind: "SIMILAR", locationName: nearDup.locationName }
            : null,
        replacedPriorPhoto: Boolean(prior),
      },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
