import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  try {
    const b = await req.json();
    const data: Record<string, unknown> = {};
    if ("name" in b) {
      if (!String(b.name).trim()) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      data.name = String(b.name).trim();
    }
    if ("city" in b) {
      if (!String(b.city).trim()) return NextResponse.json({ error: "city cannot be empty" }, { status: 400 });
      data.city = String(b.city).trim();
    }
    if ("address" in b) data.address = b.address || null;
    if ("totalSeats" in b) {
      const n = Number(b.totalSeats);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "totalSeats must be a non-negative number" }, { status: 400 });
      data.totalSeats = n;
    }
    if ("active" in b) data.active = !!b.active;
    if ("commonAreaPhotos" in b) data.commonAreaPhotos = b.commonAreaPhotos || null;

    const center = await prisma.center.update({ where: { id: params.id }, data });
    return NextResponse.json(center);
  } catch (err: any) {
    console.error("PATCH /api/centers/[id] failed:", err);
    return NextResponse.json({ error: err?.message || "update failed", code: err?.code }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const clients = await prisma.client.count({ where: { centerId: params.id, active: true } });
  if (clients > 0) return NextResponse.json({ error: "Center has active clients — deactivate them first" }, { status: 400 });
  await prisma.center.delete({ where: { id: params.id } }); // cascades to seats/cabins via schema
  return NextResponse.json({ ok: true });
}
