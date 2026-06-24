import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma, SpaceType, SpaceStatus } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { requireUser, isResponse, parseBody, handleError, VIEW_ROLES, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/spaces — list with server-side filtering + pagination.
export async function GET(req: NextRequest) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || 25)));

    const where: Prisma.SpaceWhereInput = { deletedAt: null };
    if (sp.get("centerId")) where.centerId = sp.get("centerId")!;
    if (sp.get("floorId")) where.floorId = sp.get("floorId")!;
    if (sp.get("zoneId")) where.zoneId = sp.get("zoneId")!;
    if (sp.get("type") && sp.get("type")! in SpaceType) where.type = sp.get("type") as SpaceType;
    if (sp.get("status") && sp.get("status")! in SpaceStatus) where.status = sp.get("status") as SpaceStatus;
    const q = sp.get("q")?.trim();
    if (q) where.OR = [{ code: { contains: q } }, { name: { contains: q } }];

    const [items, total] = await Promise.all([
      prisma.space.findMany({
        where,
        orderBy: [{ centerId: "asc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          center: { select: { name: true } },
          floor: { select: { name: true } },
          zone: { select: { name: true } },
          allocations: {
            where: { status: "ACTIVE", deletedAt: null },
            select: { id: true, client: { select: { id: true, companyName: true } }, startDate: true, endDate: true },
          },
        },
      }),
      prisma.space.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
  } catch (e) {
    return handleError(e);
  }
}

const createSpaceSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.nativeEnum(SpaceType),
  capacity: z.number().int().positive().default(1),
  centerId: z.string().min(1),
  floorId: z.string().min(1).optional().nullable(),
  zoneId: z.string().min(1).optional().nullable(),
  gridX: z.number().int().optional().nullable(),
  gridY: z.number().int().optional().nullable(),
});

// POST /api/occupancy/spaces — create a space.
export async function POST(req: NextRequest) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const data = parseBody(createSpaceSchema, await req.json().catch(() => ({})));

    const center = await prisma.center.findUnique({ where: { id: data.centerId }, select: { id: true } });
    if (!center) return NextResponse.json({ error: "Center not found" }, { status: 404 });
    const dup = await prisma.space.findFirst({ where: { centerId: data.centerId, code: data.code } });
    if (dup) return NextResponse.json({ error: `Code "${data.code}" already exists in this center` }, { status: 409 });

    const space = await prisma.space.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        capacity: data.capacity,
        centerId: data.centerId,
        floorId: data.floorId ?? null,
        zoneId: data.zoneId ?? null,
        gridX: data.gridX ?? null,
        gridY: data.gridY ?? null,
      },
    });
    await logAction({ userId: u.id, action: "SPACE_CREATED", targetType: "Space", targetId: space.id, meta: { code: space.code } });
    return NextResponse.json(space, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
