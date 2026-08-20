import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
const COOKIE = "erp_session";
const ALG = "HS256";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  centerId?: string | null;
  // Patch v4 — per-user module override (JSON string of module names, or null for role defaults)
  allowedModules?: string | null;
};

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 10);
}
export async function verifyPassword(p: string, hash: string) {
  return bcrypt.compare(p, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}

export async function destroySession() {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const c = cookies().get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, SECRET);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      centerId: (payload.centerId as string) || null,
      allowedModules: (payload.allowedModules as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      centerId: (payload.centerId as string) || null,
      allowedModules: (payload.allowedModules as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function loginByEmail(email: string, password: string) {
  // Email addresses are not case-sensitive, and people do not remember the casing
  // they were registered with. New rows are stored lowercased; the second lookup
  // covers rows created before that, which would otherwise only accept the exact
  // capitalisation an admin happened to type.
  const normalised = String(email ?? "").trim().toLowerCase();
  const user =
    (await prisma.user.findUnique({ where: { email: normalised } })) ??
    (await prisma.user.findFirst({ where: { email: String(email ?? "").trim() } }));
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    centerId: user.centerId,
    allowedModules: user.allowedModules ?? null,
  };
  await createSession(session);
  return session;
}

// --- Mobile bearer tokens (Android staff app) --------------------------------
//
// The web app authenticates with an httpOnly cookie, which a native client
// cannot hold. The mobile app instead sends `Authorization: Bearer <token>`.
//
// Two deliberate differences from the cookie session:
//   * access tokens are SHORT lived (1h) because they cannot be revoked once
//     issued — the refresh token is the revocable half, and it lives in a table
//   * the payload carries `mob: true`, so a token minted for the app can be
//     told apart from a cookie JWT in the audit trail
const ACCESS_TTL = "1h";

export async function createAccessToken(user: SessionUser) {
  return new SignJWT({ ...user, mob: true })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(SECRET);
}

/**
 * Resolve the caller from an Authorization header, falling back to the cookie.
 *
 * Order matters: an explicit bearer token wins over an ambient cookie so that a
 * WebView carrying both is unambiguous.
 */
export async function getRequestUser(req?: {
  headers: { get(name: string): string | null };
}): Promise<SessionUser | null> {
  const header = req?.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return verifyToken(m[1]);
  return getSessionUser();
}
