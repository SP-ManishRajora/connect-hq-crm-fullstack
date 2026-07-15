import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

const ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT", "CLIENT"];

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
    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }
    data.email = email;
  }

  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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
