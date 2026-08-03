import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { toErrorResponse } from "./types";

// Shared guards for housekeeping API routes. Unlike the occupancy helpers these
// gate on MODULE KEYS rather than raw roles, so per-user `allowedModules`
// overrides are honoured exactly as they are in the sidebar.

export async function requireModule(mod: string): Promise<SessionUser | NextResponse> {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canAccess(u.role, mod, parseAllowedModules(u.allowedModules))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return u;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw Object.assign(new Error(msg), { __status: 400 });
  }
  return r.data;
}

export function handleError(e: unknown): NextResponse {
  if (e && typeof e === "object" && "__status" in e) {
    const err = e as { __status: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: err.__status });
  }
  const { status, error } = toErrorResponse(e);
  return NextResponse.json({ error }, { status });
}

// Centre scoping: ADMIN/OWNER see every centre; everyone else is pinned to their
// own `centerId`. Returns the centreId to filter by, or null for "all".
export function centerScope(u: SessionUser): string | null {
  if (u.role === "ADMIN" || u.role === "OWNER") return null;
  return u.centerId ?? null;
}

export function assertCenterAllowed(u: SessionUser, centerId: string) {
  const scope = centerScope(u);
  if (scope !== null && scope !== centerId) {
    throw Object.assign(new Error("You cannot access this centre"), { __status: 403 });
  }
}
