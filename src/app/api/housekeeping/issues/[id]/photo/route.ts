import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import {
  sniffImageMime, isAllowedMime, sha256Hex, storePhoto, photoUrl,
} from "@/lib/housekeeping/storage";
import { isValidPhash, isNearDuplicate } from "@/lib/housekeeping/phash";
import { VISIT_FLAGS } from "@/lib/housekeeping/types";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

// POST /api/housekeeping/issues/[id]/photo  (multipart/form-data)
// Uploads an "after" photograph for a corrective action.
//
// Reuses the private-storage + duplicate-detection pipeline from the inspection
// flow. Reuse detection matters more here than anywhere: an "after" photo that
// is really the "before" photo, or one recycled from another job, is the obvious
// way to fake a completed task.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const issue = await prisma.hkIssue.findUnique({
      where: { id: params.id },
      include: { actions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    const isAssignee = issue.assigneeId === u.id;
    const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);
    if (!isAssignee && !isManager) {
      throw Object.assign(new Error("Only the assignee can upload the after photograph"), { __status: 403 });
    }
    if (issue.status !== "IN_PROGRESS") {
      throw Object.assign(
        new Error("Mark the work as started before uploading an after photograph"),
        { __status: 409 },
      );
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw Object.assign(new Error("No file provided"), { __status: 400 });
    if (file.size > MAX_BYTES) {
      throw Object.assign(new Error("Photograph is too large (max 12 MB)"), { __status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageMime(buf);
    if (!isAllowedMime(mime)) {
      throw Object.assign(new Error("Only JPEG, PNG or WebP photographs are accepted"), { __status: 415 });
    }

    const flags: string[] = [];
    const sha256 = sha256Hex(buf);

    // Identical bytes to any existing photo — including this issue's own "before".
    const exact = await prisma.inspectionPhoto.findFirst({
      where: { sha256 },
      select: { id: true, location: { select: { name: true } } },
    });
    if (exact) flags.push(VISIT_FLAGS.DUPLICATE_PHOTO);

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
      if (hit) {
        nearDup = { id: hit.id, locationName: hit.location.name };
        flags.push(VISIT_FLAGS.DUPLICATE_PHOTO);
      }
    }

    // An "after" photo needs a location to hang off. Issues raised without one
    // (rare — manual, centre-wide) borrow the centre's first active area so the
    // required relation holds; the issue link is what actually matters.
    let locationId = issue.locationId;
    if (!locationId) {
      const fallback = await prisma.inspectionLocation.findFirst({
        where: { centerId: issue.centerId, deletedAt: null },
        select: { id: true },
        orderBy: { sortOrder: "asc" },
      });
      if (!fallback) {
        throw Object.assign(
          new Error("This centre has no inspection areas — create one before uploading evidence"),
          { __status: 409 },
        );
      }
      locationId = fallback.id;
    }

    // Stored under the issue id rather than a visit id; `visitId` stays null
    // because an after-photo does not belong to an inspection visit.
    const relPath = await storePhoto(`issue-${issue.id}`, 0, buf, mime!);

    const photo = await prisma.inspectionPhoto.create({
      data: {
        visitId: null,
        locationId,
        userId: u.id,
        angle: "After cleaning",
        slot: 0,
        filePath: relPath,
        mimeType: mime!,
        sizeBytes: buf.length,
        captureAt: null,
        sha256,
        pHash,
        source: "CAMERA",
        beforeAfter: "AFTER",
        flags: flags.length ? JSON.stringify(flags) : null,
      },
    });

    // Attach to the open corrective action so completion can reference it.
    if (issue.actions[0]) {
      await prisma.correctiveAction.update({
        where: { id: issue.actions[0].id },
        data: { afterPhotoId: photo.id },
      });
    }

    await logAction({
      userId: u.id,
      action: "HK_ISSUE_AFTER_PHOTO_UPLOADED",
      targetType: "HkIssue",
      targetId: issue.id,
      meta: { photoId: photo.id, flags, duplicateOf: exact?.id ?? nearDup?.id ?? null },
    });

    return NextResponse.json(
      {
        id: photo.id,
        url: photoUrl(photo.id),
        flags,
        duplicate: exact
          ? { kind: "EXACT", locationName: exact.location.name }
          : nearDup
            ? { kind: "SIMILAR", locationName: nearDup.locationName }
            : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
