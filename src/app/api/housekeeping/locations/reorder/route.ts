import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { reorderSchema } from "@/lib/housekeeping/validators";

// POST /api/housekeeping/locations/reorder — persist the inspection route order.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(reorderSchema, await req.json());
    assertCenterAllowed(u, body.centerId);

    // Only reorder locations that genuinely belong to this centre, so a crafted
    // id list can't touch another centre's rows.
    const owned = await prisma.inspectionLocation.findMany({
      where: { centerId: body.centerId, deletedAt: null, id: { in: body.orderedIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));

    await prisma.$transaction(
      body.orderedIds
        .filter((id) => ownedIds.has(id))
        .map((id, idx) =>
          prisma.inspectionLocation.update({
            where: { id },
            data: { sortOrder: idx },
          }),
        ),
    );

    await logAction({
      userId: u.id,
      action: "HK_LOCATIONS_REORDERED",
      targetType: "Center",
      targetId: body.centerId,
      meta: { count: ownedIds.size },
    });

    return NextResponse.json({ ok: true, updated: ownedIds.size });
  } catch (e) {
    return handleError(e);
  }
}
