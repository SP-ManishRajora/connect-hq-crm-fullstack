import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const clients = await prisma.client.count({ where: { centerId: params.id, active: true } });
  if (clients > 0) return NextResponse.json({ error: "Center has active clients — deactivate them first" }, { status: 400 });
  await prisma.center.delete({ where: { id: params.id } }); // cascades to seats/cabins via schema
  return NextResponse.json({ ok: true });
}
