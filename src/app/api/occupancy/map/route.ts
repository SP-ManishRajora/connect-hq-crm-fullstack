import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma, SpaceType, SpaceStatus } from "@prisma/client";
import { requireUser, isResponse, handleError, VIEW_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/map?centerId=&type=&status=&q=
// Returns ALL matching spaces for the visual map (no pagination), grouped by center,
// with the active client. Use the paginated /spaces endpoint for tables.
export async function GET(req: NextRequest) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const sp = req.nextUrl.searchParams;
    const where: Prisma.SpaceWhereInput = { deletedAt: null };
    if (sp.get("centerId")) where.centerId = sp.get("centerId")!;
    if (sp.get("type") && sp.get("type")! in SpaceType) where.type = sp.get("type") as SpaceType;
    if (sp.get("status") && sp.get("status")! in SpaceStatus) where.status = sp.get("status") as SpaceStatus;
    const q = sp.get("q")?.trim();
    if (q) where.OR = [{ code: { contains: q } }, { name: { contains: q } }];

    const spaces = await prisma.space.findMany({
      where,
      orderBy: [{ centerId: "asc" }, { type: "asc" }, { code: "asc" }],
      take: 5000, // safety cap for the visual view
      select: {
        id: true, code: true, name: true, type: true, status: true,
        gridX: true, gridY: true,
        center: { select: { id: true, name: true } },
        allocations: {
          where: { status: "ACTIVE", deletedAt: null },
          select: { id: true, client: { select: { id: true, companyName: true } }, endDate: true },
        },
        reservations: {
          where: { released: false },
          orderBy: { expiresAt: "asc" },
          take: 1,
          select: { id: true, clientId: true, expiresAt: true },
        },
      },
    });

    // Reservation.clientId has no relation; resolve the held-for client names in one query
    // and attach a reservedFor label to each space that has an active reservation.
    const reservedClientIds = Array.from(
      new Set(spaces.flatMap((s) => s.reservations.map((r) => r.clientId).filter(Boolean) as string[])),
    );
    const clientNames = reservedClientIds.length
      ? new Map(
          (await prisma.client.findMany({ where: { id: { in: reservedClientIds } }, select: { id: true, companyName: true } }))
            .map((c) => [c.id, c.companyName]),
        )
      : new Map<string, string>();

    const enriched = spaces.map((s) => {
      const res = s.reservations[0];
      const reservedFor = res?.clientId ? clientNames.get(res.clientId) ?? null : null;
      return { ...s, reservedFor, reservedUntil: res?.expiresAt ?? null };
    });

    // Group by center for the grid view.
    const byCenter = new Map<string, { centerId: string; centerName: string; spaces: typeof enriched }>();
    for (const s of enriched) {
      const key = s.center.id;
      if (!byCenter.has(key)) byCenter.set(key, { centerId: key, centerName: s.center.name, spaces: [] });
      byCenter.get(key)!.spaces.push(s);
    }
    return NextResponse.json({ groups: Array.from(byCenter.values()), total: enriched.length });
  } catch (e) {
    return handleError(e);
  }
}
