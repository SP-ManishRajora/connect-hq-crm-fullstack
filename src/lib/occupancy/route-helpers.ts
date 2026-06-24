import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { requireRole, type Role } from "@/lib/rbac";
import { toErrorResponse } from "./types";

// Shared guards for occupancy API routes — keeps auth/role/validation/error-mapping uniform.

// Roles allowed to view occupancy data, and the subset allowed to mutate it.
export const VIEW_ROLES: Role[] = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER", "SALES", "ACCOUNTS"];
export const MANAGE_ROLES: Role[] = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"];

// Returns the session user if their role is in `roles`, else a NextResponse to return early.
export async function requireUser(roles: Role[]): Promise<SessionUser | NextResponse> {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, roles)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return u;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}

// Parse a request body with a Zod schema; throws a 400-shaped object on failure
// (caught by handleError). Returns the typed value on success.
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw Object.assign(new Error(msg), { __status: 400 });
  }
  return r.data;
}

// Map any thrown value (HttpError, zod-400, unknown) to a NextResponse.
export function handleError(e: unknown): NextResponse {
  if (e && typeof e === "object" && "__status" in e) {
    const err = e as { __status: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: err.__status });
  }
  const { status, error } = toErrorResponse(e);
  return NextResponse.json({ error }, { status });
}
