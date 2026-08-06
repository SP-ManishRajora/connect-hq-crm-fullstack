import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { listRoles } from "@/lib/roles";

// Roles are data (the AppRole table), not a fixed list — the roles admin screen
// can add them. A hardcoded array here silently rejects every custom role, so a
// user on HOUSEKEEPING or EMPLOYEE could not be saved at all. Fall back to the
// built-in set only when the table is unreachable.
const BUILT_IN_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT", "CLIENT"];

async function isKnownRole(role: string): Promise<boolean> {
  try {
    const rows = await listRoles();
    if (rows.length) return rows.some((r) => r.key === role);
  } catch {
    // fall through to the built-ins below
  }
  return BUILT_IN_ROLES.includes(role);
}

// PATCH — edit a user's details (Admin/Owner only). Password is only changed
// when a non-empty `password` is supplied; otherwise it is left untouched.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) {
    return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, any> = {};

  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = name;
  }

  if (b.email !== undefined) {
    const email = String(b.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    // Compare case-insensitively against the STORED value. Older rows were saved
    // with the address as typed ("Dablu@…"), so comparing a lowercased submission
    // against them reads as a change even when the user edited nothing — the
    // lookup then finds their own row and reports it as taken.
    //
    // Excluding `params.id` is the real guard: it means a genuine clash can only
    // ever be a DIFFERENT user, whatever the casing on either side.
    if (email !== target.email.toLowerCase()) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: params.id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }
    data.email = email;
  }

  if (b.role !== undefined) {
    if (!(await isKnownRole(b.role))) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Guard: an admin cannot demote themselves out of ADMIN (avoids self-lockout).
    if (me.id === params.id && target.role === "ADMIN" && b.role !== "ADMIN") {
      return NextResponse.json({ error: "You cannot change your own admin role" }, { status: 400 });
    }
    data.role = b.role;
  }

  if (b.centerId !== undefined) data.centerId = b.centerId || null;
  if (b.phone !== undefined) data.phone = b.phone ? String(b.phone).trim() : null;

  if (b.password) {
    if (String(b.password).length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    data.passwordHash = await hashPassword(String(b.password));
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  if (me.id === params.id) return NextResponse.json({ error: "Cannot disable yourself" }, { status: 400 });
  await prisma.user.update({ where: { id: params.id }, data: { active: false, deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
