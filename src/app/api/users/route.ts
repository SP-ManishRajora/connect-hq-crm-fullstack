import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const b = await req.json();
  const exists = await prisma.user.findUnique({ where: { email: b.email } });
  if (exists) return NextResponse.json({ error: "Email already exists" }, { status: 400 });
  const passwordHash = await hashPassword(b.password);
  const u = await prisma.user.create({
    data: {
      name: b.name,
      email: b.email,
      passwordHash,
      role: b.role,
      centerId: b.centerId || null,
      phone: b.phone || null,
    },
  });
  return NextResponse.json({ id: u.id });
}
