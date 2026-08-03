import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import {
  sniffImageMime, isAllowedMime, sha256Hex, storePhoto,
} from "@/lib/housekeeping/storage";
import { isValidPhash, isNearDuplicate } from "@/lib/housekeeping/phash";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

// POST /api/housekeeping/requests/[id]/photo — after-cleaning evidence.
// Reuses the private-storage + duplicate pipeline: a recycled "after" photo is
// the simplest way to fake a completed job (brief §32 lists it explicitly).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_requests");
  if (isResponse(u)) return u;

  try {
    const r = await prisma.cleaningRequest.findUnique({ where: { id: params.id } });
    if (!r) throw Object.assign(new Error("Request not found"), { __status: 404 });
    assertCenterAllowed(u, r.centerId);

    const isAssignee = r.assigneeId === u.id;
    const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);
    if (!isAssignee && !isManager) {
      throw Object.assign(new Error("This request is assigned to someone else"), { __status: 403 });
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

    const sha256 = sha256Hex(buf);
    const flags: string[] = [];
    let duplicate: { kind: string; seenAt: string } | null = null;

    const exact = await prisma.cleaningRequestPhoto.findFirst({
      where: { sha256 }, orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (exact) {
      duplicate = { kind: "EXACT", seenAt: exact.createdAt.toISOString() };
      flags.push("DUPLICATE_PHOTO");
    }

    const rawPhash = String(form.get("pHash") || "");
    const pHash = isValidPhash(rawPhash) ? rawPhash.toLowerCase() : null;
    if (!exact && pHash) {
      const recent = await prisma.cleaningRequestPhoto.findMany({
        where: { pHash: { not: null } }, orderBy: { createdAt: "desc" }, take: 300,
        select: { pHash: true, createdAt: true },
      });
      const hit = recent.find((x) => x.pHash && isNearDuplicate(x.pHash, pHash));
      if (hit) {
        duplicate = { kind: "SIMILAR", seenAt: hit.createdAt.toISOString() };
        flags.push("DUPLICATE_PHOTO");
      }
    }

    const kind = String(form.get("kind") || "AFTER") === "BEFORE" ? "BEFORE" : "AFTER";
    const relPath = await storePhoto(`cr-${r.id}`, 0, buf, mime!);

    const photo = await prisma.cleaningRequestPhoto.create({
      data: {
        requestId: r.id, kind, filePath: relPath, mimeType: mime!,
        sizeBytes: buf.length, sha256, pHash, userId: u.id,
        flags: flags.length ? JSON.stringify(flags) : null,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_CLEANING_REQUEST_PHOTO",
      targetType: "CleaningRequest",
      targetId: r.id,
      meta: { ticketNo: r.ticketNo, photoId: photo.id, kind, flags },
    });

    return NextResponse.json({ id: photo.id, kind, flags, duplicate }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
