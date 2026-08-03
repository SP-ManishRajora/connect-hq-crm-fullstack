import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
  centerScope,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { startRoundSchema } from "@/lib/housekeeping/validators";

// GET /api/housekeeping/rounds?mine=1&status=IN_PROGRESS
export async function GET(req: NextRequest) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const mine = searchParams.get("mine") === "1";
    const status = searchParams.get("status") || undefined;
    const scope = centerScope(u);

    const rows = await prisma.inspectionRound.findMany({
      where: {
        ...(mine ? { userId: u.id } : {}),
        ...(status ? { status: status as any } : {}),
        ...(scope ? { centerId: scope } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        center: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { visits: true } },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/housekeeping/rounds — start a round.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(startRoundSchema, await req.json());
    assertCenterAllowed(u, body.centerId);

    const center = await prisma.center.findUnique({ where: { id: body.centerId } });
    if (!center) throw Object.assign(new Error("Centre not found"), { __status: 404 });

    // One open round per user at a time — resume rather than fragmenting the
    // history across parallel rounds.
    const open = await prisma.inspectionRound.findFirst({
      where: { userId: u.id, status: "IN_PROGRESS" },
    });
    if (open) {
      return NextResponse.json(
        { ...open, resumed: true },
        { status: 200 },
      );
    }

    const row = await prisma.inspectionRound.create({
      data: {
        centerId: body.centerId,
        userId: u.id,
        notes: body.notes ?? null,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_ROUND_STARTED",
      targetType: "InspectionRound",
      targetId: row.id,
      meta: { centerId: row.centerId },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
