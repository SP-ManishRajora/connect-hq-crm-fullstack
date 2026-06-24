import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { allocateSchema } from "@/lib/occupancy/validators";
import { allocateSpaces } from "@/lib/occupancy/service";
import { requireUser, isResponse, parseBody, handleError, VIEW_ROLES, MANAGE_ROLES } from "@/lib/occupancy/route-helpers";

// GET /api/occupancy/allocations — list (filter by clientId / status), paginated.
export async function GET(req: NextRequest) {
  const u = await requireUser(VIEW_ROLES);
  if (isResponse(u)) return u;
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || 25)));
    const where: Prisma.AllocationWhereInput = { deletedAt: null };
    if (sp.get("clientId")) where.clientId = sp.get("clientId")!;
    if (sp.get("status")) where.status = sp.get("status") as any;

    const [items, total] = await Promise.all([
      prisma.allocation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          space: { select: { id: true, code: true, name: true, type: true } },
          client: { select: { id: true, companyName: true } },
          contract: { select: { id: true, endDate: true } },
        },
      }),
      prisma.allocation.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/occupancy/allocations — allocate one or more spaces to a client (bulk-capable).
export async function POST(req: NextRequest) {
  const u = await requireUser(MANAGE_ROLES);
  if (isResponse(u)) return u;
  try {
    const dto = parseBody(allocateSchema, await req.json().catch(() => ({})));
    const created = await allocateSpaces(dto, u);
    return NextResponse.json({ allocations: created }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
