import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { reserveSchema } from "@/lib/occupancy/validators";
import { reserveSpace } from "@/lib/occupancy/service";
import { requireUser, isResponse, parseBody, handleError, VIEW_ROLES, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/reservations — list active (default) or all reservations.
export async function GET(req: NextRequest) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const sp = req.nextUrl.searchParams;
    const where: Prisma.ReservationWhereInput = {};
    if (sp.get("includeReleased") !== "1") where.released = false;
    if (sp.get("spaceId")) where.spaceId = sp.get("spaceId")!;

    const items = await prisma.reservation.findMany({
      where,
      orderBy: { expiresAt: "asc" },
      include: {
        space: { select: { id: true, code: true, name: true } },
        reservedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/occupancy/reservations — temporarily hold an available space.
export async function POST(req: NextRequest) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const dto = parseBody(reserveSchema, await req.json().catch(() => ({})));
    const reservation = await reserveSpace(dto, u);
    return NextResponse.json(reservation, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
