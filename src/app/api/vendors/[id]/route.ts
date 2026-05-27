import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  await prisma.vendor.update({ where: { id: params.id }, data: { active: false, deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
