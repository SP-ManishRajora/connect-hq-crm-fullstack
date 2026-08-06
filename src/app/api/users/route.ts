import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { listRoles } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const b = await req.json();
  // Store the address lowercased. Saving it as typed lets "Santosh@…" and
  // "santosh@…" exist as two accounts, and leaves rows that later fail their own
  // edit because the submitted (lowercased) address no longer matches what is on
  // disk — the "Email already in use" report against oneself.
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Email already exists" }, { status: 400 });

  // Validated against the AppRole table so custom roles work, and so a typo
  // cannot create a user on a role that grants nothing.
  const roles = await listRoles().catch(() => []);
  if (roles.length && !roles.some((r) => r.key === b.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const passwordHash = await hashPassword(b.password);
  const u = await prisma.user.create({
    data: {
      name: b.name,
      email,
      passwordHash,
      role: b.role,
      centerId: b.centerId || null,
      phone: b.phone || null,
    },
  });
  return NextResponse.json({ id: u.id });
}
