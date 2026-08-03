import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { acknowledgeAlert } from "@/lib/housekeeping/alerts";

// POST /api/housekeeping/alerts/[id]/ack
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const a = await prisma.hkAlert.findUnique({ where: { id: params.id } });
    if (!a) throw Object.assign(new Error("Alert not found"), { __status: 404 });
    assertCenterAllowed(u, a.centerId);
    if (a.status !== "NEW") {
      throw Object.assign(new Error("This alert is already acknowledged"), { __status: 409 });
    }
    return NextResponse.json(await acknowledgeAlert(a.id, u.id));
  } catch (e) {
    return handleError(e);
  }
}
