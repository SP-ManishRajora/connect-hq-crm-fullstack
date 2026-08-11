import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { toErrorResponse } from "./types";

// Shared guards for housekeeping API routes. Unlike the occupancy helpers these
// gate on MODULE KEYS rather than raw roles, so per-user `allowedModules`
// overrides are honoured exactly as they are in the sidebar.
//
// Resolution order (identical to the sidebar's, via canAccessAsync):
//   1. User.allowedModules — a per-user override always wins
//   2. the role's modules from the AppRole table
//   3. the hard-coded MODULE_ACCESS map, when that row is missing or the
//      database is unreachable
//
// The synchronous canAccess() only ever sees step 3, so a custom role such as
// HOUSEKEEPING — which exists only in AppRole — was shown a sidebar link and then
// refused by the route behind it.
export async function requireModule(mod: string): Promise<SessionUser | NextResponse> {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessAsync(u.role, mod, u.allowedModules))) {
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

/**
 * Like `requireModule`, but also admits the person the issue is assigned to.
 *
 * Work can be given to anyone — a caretaker, someone covering a shift — and
 * they must be able to start it, photograph it and submit it even if their role
 * has no housekeeping module. The per-issue assignee check inside each route
 * still applies, so this widens WHO may reach the route, not WHAT they may do.
 */
export async function requireModuleOrAssignee(
  mod: string,
  issueId: string,
): Promise<SessionUser | NextResponse> {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (await canAccessAsync(u.role, mod, u.allowedModules)) return u;

  const mine = await prisma.hkIssue.findFirst({
    where: { id: issueId, assigneeId: u.id },
    select: { id: true },
  });
  if (mine) return u;

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
