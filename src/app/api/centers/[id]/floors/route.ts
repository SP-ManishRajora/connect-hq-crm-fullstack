import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageCenter } from "@/lib/center-access";

// GET /api/centers/[id]/floors — list a center's floors (ordered).
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const floors = await prisma.floor.findMany({ where: { centerId: params.id }, orderBy: { level: "asc" } });
  return NextResponse.json(floors);
}

// POST /api/centers/[id]/floors — add a floor. Requires a name; plan image(s) are optional.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const name = String(b?.name || "").trim();
  const planImages: string[] = Array.isArray(b?.planImages) ? b.planImages.filter(Boolean) : [];
  if (!name) return NextResponse.json({ error: "Floor name is required." }, { status: 400 });

  // Level: use provided value, else append after the highest existing level for this center.
  let level = Number.isInteger(b?.level) ? Number(b.level) : NaN;
  if (!Number.isInteger(level)) {
    const last = await prisma.floor.findFirst({ where: { centerId: params.id }, orderBy: { level: "desc" }, select: { level: true } });
    level = last ? last.level + 1 : 0;
  }

  // @@unique([centerId, level]) — guard against a clash.
  const clash = await prisma.floor.findFirst({ where: { centerId: params.id, level } });
  if (clash) return NextResponse.json({ error: `A floor already exists at level ${level}.` }, { status: 409 });

  const floor = await prisma.floor.create({
    data: { centerId: params.id, name, level, planImages: JSON.stringify(planImages) },
  });
  return NextResponse.json(floor);
}

// DELETE /api/centers/[id]/floors?floorId=... — remove a floor.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const floorId = req.nextUrl.searchParams.get("floorId");
  if (!floorId) return NextResponse.json({ error: "floorId required" }, { status: 400 });

  const floor = await prisma.floor.findUnique({ where: { id: floorId }, select: { centerId: true } });
  if (!floor || floor.centerId !== params.id) return NextResponse.json({ error: "Floor not found" }, { status: 404 });

  // Zones/spaces reference floorId (nullable) — detach them so the delete is safe.
  await prisma.$transaction([
    prisma.zone.updateMany({ where: { floorId }, data: { floorId: null } }),
    prisma.space.updateMany({ where: { floorId }, data: { floorId: null } }),
    prisma.floor.delete({ where: { id: floorId } }),
  ]);
  return NextResponse.json({ ok: true });
}
