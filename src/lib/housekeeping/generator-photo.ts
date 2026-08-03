// Shared ingest for generator photographs (panel, tank, meter, refill).
//
// Same private-storage + magic-byte + duplicate pipeline as inspection photos.
// Reuse detection matters especially here: recycling yesterday's tank photo is
// the simplest way to fake a fuel reading, and it is brief §11 rule 9.

import { prisma } from "@/lib/db";
import {
  sniffImageMime, isAllowedMime, sha256Hex, storePhoto,
} from "./storage";
import { isValidPhash, isNearDuplicate } from "./phash";

export type IngestResult = {
  photoId: string;
  duplicate: { kind: "EXACT" | "SIMILAR"; seenAt: string } | null;
};

const MAX_BYTES = 12 * 1024 * 1024;

export async function ingestGeneratorPhoto(opts: {
  file: File;
  generatorId: string;
  centerId: string;
  userId: string;
  kind: "PANEL" | "TANK" | "METER" | "REFILL";
  pHash?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<IngestResult> {
  if (opts.file.size > MAX_BYTES) {
    throw Object.assign(new Error("Photograph is too large (max 12 MB)"), { __status: 413 });
  }

  const buf = Buffer.from(await opts.file.arrayBuffer());
  const mime = sniffImageMime(buf);
  if (!isAllowedMime(mime)) {
    throw Object.assign(new Error("Only JPEG, PNG or WebP photographs are accepted"), { __status: 415 });
  }

  const sha256 = sha256Hex(buf);
  const flags: string[] = [];
  let duplicate: IngestResult["duplicate"] = null;

  // Exact byte match against any previous generator photo — server-computed.
  const exact = await prisma.generatorPhoto.findFirst({
    where: { sha256 },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (exact) {
    duplicate = { kind: "EXACT", seenAt: exact.createdAt.toISOString() };
    flags.push("DUPLICATE_PHOTO");
  }

  const pHash = opts.pHash && isValidPhash(opts.pHash) ? opts.pHash.toLowerCase() : null;
  if (!exact && pHash) {
    const recent = await prisma.generatorPhoto.findMany({
      where: { generatorId: opts.generatorId, pHash: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { pHash: true, createdAt: true },
    });
    const hit = recent.find((r) => r.pHash && isNearDuplicate(r.pHash, pHash));
    if (hit) {
      duplicate = { kind: "SIMILAR", seenAt: hit.createdAt.toISOString() };
      flags.push("DUPLICATE_PHOTO");
    }
  }

  const relPath = await storePhoto(`gen-${opts.generatorId}`, 0, buf, mime!);

  const photo = await prisma.generatorPhoto.create({
    data: {
      generatorId: opts.generatorId,
      centerId: opts.centerId,
      userId: opts.userId,
      kind: opts.kind,
      filePath: relPath,
      mimeType: mime!,
      sizeBytes: buf.length,
      sha256,
      pHash,
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
      flags: flags.length ? JSON.stringify(flags) : null,
    },
  });

  return { photoId: photo.id, duplicate };
}

export function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
