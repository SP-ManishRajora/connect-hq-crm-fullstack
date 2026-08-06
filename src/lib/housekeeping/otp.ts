import { randomInt, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

// One-time passcodes for the public area-QR flow. A member scanning a sticker has
// no account and should not need one, so the passcode is the entire proof that
// they control the contact detail they typed.
//
// That makes this the only barrier between the review table and anyone with a
// phone, hence the deliberate choices below:
//   • the code is stored as a scrypt hash with a per-row salt — a dumped table
//     yields no live codes
//   • comparison is constant-time, so response timing cannot leak a prefix
//   • attempts are capped per code, because rate limiting alone does not stop a
//     6-digit brute force (a million guesses spread across IPs is cheap)
//   • a consumed code is never re-accepted, so a shoulder-surfed SMS is single-use

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong guesses tolerated before the code is dead. 5 leaves room for typos. */
export const OTP_MAX_ATTEMPTS = 5;

/** Codes issued to one destination per window, and per IP. */
export const OTP_PER_DESTINATION = 3;
export const OTP_PER_IP = 10;
export const OTP_WINDOW_MS = 15 * 60 * 1000;

export type OtpChannel = "SMS" | "EMAIL";

/**
 * Digits-only for phones, lowercased for email. Normalising on the way in means
 * "+91 98765 43210" and "9876543210" rate-limit as the same person rather than
 * as two, which is exactly the hole a determined spammer would use.
 */
export function normaliseDestination(raw: string, channel: OtpChannel): string {
  const v = raw.trim();
  if (channel === "EMAIL") return v.toLowerCase();
  const digits = v.replace(/\D/g, "");
  // Indian numbers arrive as 10 digits, or 12 with the 91 country code. Store the
  // last 10 so both spellings collapse to one identity.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidDestination(value: string, channel: OtpChannel): boolean {
  if (channel === "EMAIL") return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
  // Indian mobile numbers are 10 digits starting 6-9.
  return /^[6-9]\d{9}$/.test(value);
}

/**
 * Cryptographically random, not Math.random — a predictable code is no code.
 * Leading zeros are preserved so every value in the space is reachable.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

function hashCode(code: string, salt: string): string {
  return scryptSync(code, salt, 32).toString("hex");
}

/** Constant-time compare — a fast-fail on the first wrong digit would leak it. */
function codeMatches(code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashCode(code, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export type IssuedOtp = { id: string; code: string; expiresAt: Date };

/**
 * Mint a passcode for a destination. Returns the PLAINTEXT code for the sender to
 * deliver — it is never persisted and cannot be recovered afterwards.
 *
 * Any earlier live code for the same destination is consumed first, so a person
 * who taps "resend" cannot end up with several valid codes in flight.
 */
export async function issueOtp(opts: {
  destination: string;
  channel: OtpChannel;
  locationId?: string | null;
  centerId?: string | null;
  requestIp?: string | null;
}): Promise<IssuedOtp> {
  const now = new Date();

  await prisma.clientOtp.updateMany({
    where: { destination: opts.destination, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  const code = generateCode();
  const salt = randomBytes(16).toString("hex");
  const row = await prisma.clientOtp.create({
    data: {
      destination: opts.destination,
      channel: opts.channel,
      codeHash: hashCode(code, salt),
      salt,
      locationId: opts.locationId ?? null,
      centerId: opts.centerId ?? null,
      expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
      requestIp: opts.requestIp ?? null,
    },
    select: { id: true, expiresAt: true },
  });

  return { id: row.id, code, expiresAt: row.expiresAt };
}

export type VerifyResult =
  | { ok: true; otpId: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "WRONG_CODE" };

/**
 * Check a submitted code and consume it on success.
 *
 * Every failure mode returns the same shape and the caller reports one message,
 * so an attacker cannot distinguish "no such code" from "wrong code" and use the
 * difference to enumerate destinations.
 */
export async function verifyOtp(destination: string, code: string): Promise<VerifyResult> {
  const now = new Date();

  const row = await prisma.clientOtp.findFirst({
    where: { destination, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.expiresAt <= now) return { ok: false, reason: "EXPIRED" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };

  if (!codeMatches(code, row.salt, row.codeHash)) {
    // Count the miss BEFORE returning, so a crash mid-verify cannot hand an
    // attacker a free guess.
    await prisma.clientOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "WRONG_CODE" };
  }

  await prisma.clientOtp.update({ where: { id: row.id }, data: { consumedAt: now } });
  return { ok: true, otpId: row.id };
}

/**
 * A consumed OTP is the ticket that lets a review be posted. It stays usable for
 * a short grace window after verification so the person has time to type their
 * review, and is bound to the destination it was issued for.
 */
export const OTP_REVIEW_GRACE_MINUTES = 30;

export async function findVerifiedOtp(otpId: string, destination: string) {
  const row = await prisma.clientOtp.findUnique({ where: { id: otpId } });
  if (!row || !row.consumedAt || row.destination !== destination) return null;
  const deadline = new Date(row.consumedAt.getTime() + OTP_REVIEW_GRACE_MINUTES * 60 * 1000);
  if (deadline <= new Date()) return null;
  return row;
}

/** Codes are short-lived; keep the table from growing without bound. */
export async function purgeExpiredOtps(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const r = await prisma.clientOtp.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}
