import crypto from "crypto";
import { prisma } from "@/lib/db";
import { createAccessToken, type SessionUser } from "@/lib/auth";

// Refresh tokens for the Android staff app.
//
// The access token is a short-lived JWT that cannot be withdrawn once minted.
// This is the revocable half: an opaque random string, stored only as a sha256
// digest so that a database leak does not hand over working credentials.
//
// Rotation is single-use — refreshing revokes the presented token and issues a
// new one. If a stolen token is replayed after the real device has already
// refreshed, the replay finds a revoked row and fails.

const REFRESH_TTL_DAYS = 60;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newOpaqueToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token lifetime, seconds
};

export async function issueTokenPair(
  user: SessionUser,
  deviceId?: string | null,
): Promise<TokenPair> {
  const refreshToken = newOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.mobileRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      deviceId: deviceId ?? null,
      expiresAt,
    },
  });

  return {
    accessToken: await createAccessToken(user),
    refreshToken,
    expiresIn: 60 * 60,
  };
}

/**
 * Exchange a refresh token for a new pair, rotating the old one out.
 *
 * Returns null for every failure mode — unknown, expired, revoked, or belonging
 * to a user who has since been deactivated — so a caller cannot distinguish
 * them and probe for valid tokens.
 */
export async function rotateRefreshToken(
  presented: string,
  deviceId?: string | null,
): Promise<TokenPair | null> {
  const row = await prisma.mobileRefreshToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    include: { user: true },
  });

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (!row.user.active) return null;

  // Single use: the presented token dies here whether or not the caller is the
  // device that legitimately holds it.
  await prisma.mobileRefreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });

  const session: SessionUser = {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
    centerId: row.user.centerId,
    allowedModules: row.user.allowedModules ?? null,
  };

  return issueTokenPair(session, deviceId ?? row.deviceId);
}

/** Sign out one device. */
export async function revokeRefreshToken(presented: string) {
  await prisma.mobileRefreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Sign out every device for a user — used when a phone is lost. */
export async function revokeAllForUser(userId: string) {
  const r = await prisma.mobileRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return r.count;
}
