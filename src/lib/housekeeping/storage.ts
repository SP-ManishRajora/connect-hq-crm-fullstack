// Private photo storage + signed URLs.
//
// Inspection photos are EVIDENCE. Unlike the generic /api/upload route (which
// writes into public/uploads/ and is world-readable by URL guess, since
// middleware allowlists /uploads/), these files are written outside public/ and
// can only be fetched through a signed, role-checked route.
//
// HK_STORAGE_DRIVER is reserved for a future MinIO/S3 driver; only "local" is
// implemented today and the interface is kept narrow so a swap stays contained.

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

const ROOT =
  process.env.HK_UPLOAD_DIR || path.join(process.cwd(), "private-uploads", "housekeeping");

function signingSecret(): string {
  return (
    process.env.HK_SIGNED_URL_SECRET ||
    process.env.JWT_SECRET ||
    "dev-secret-change-me"
  );
}

// Accept only formats a phone camera actually produces.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Magic-byte sniffing — never trust the client-declared mime type.
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function isAllowedMime(m: string | null): boolean {
  return !!m && ALLOWED_MIME.has(m);
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// Store a photo under private-uploads/housekeeping/<visitId>/<slot>-<hash>.<ext>
// Returns the path relative to ROOT — the absolute path never leaves the server.
export async function storePhoto(
  visitId: string,
  slot: number,
  buf: Buffer,
  mime: string,
): Promise<string> {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const safeVisit = visitId.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(ROOT, safeVisit);
  await mkdir(dir, { recursive: true });

  const name = `${slot}-${Date.now()}-${sha256Hex(buf).slice(0, 12)}.${ext}`;
  await writeFile(path.join(dir, name), buf);
  return path.posix.join(safeVisit, name);
}

// Read a stored photo. Rejects any relative path that escapes ROOT.
export async function readPhoto(relPath: string): Promise<Buffer> {
  const full = path.resolve(ROOT, relPath);
  const rootResolved = path.resolve(ROOT);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw new Error("invalid photo path");
  }
  return readFile(full);
}

// --- Signed URLs -----------------------------------------------------------
// Token binds the photo id to an expiry. Access is ALSO re-checked against the
// session on every fetch, so a leaked token alone is not enough.

export function signPhoto(photoId: string, ttlSeconds = 3600): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: signature(photoId, exp) };
}

export function verifyPhotoSignature(photoId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(photoId, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signature(photoId: string, exp: number): string {
  return createHmac("sha256", signingSecret()).update(`${photoId}.${exp}`).digest("hex");
}

export function photoUrl(photoId: string, ttlSeconds = 3600): string {
  const { exp, sig } = signPhoto(photoId, ttlSeconds);
  return `/api/housekeeping/photos/${photoId}/file?exp=${exp}&sig=${sig}`;
}

// Generator photos live in a separate table and are served by their own
// route, but share the same signing scheme.
export function generatorPhotoUrl(photoId: string, ttlSeconds = 3600): string {
  const { exp, sig } = signPhoto(photoId, ttlSeconds);
  return `/api/housekeeping/generators/photos/${photoId}/file?exp=${exp}&sig=${sig}`;
}
