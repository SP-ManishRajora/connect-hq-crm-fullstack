import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, centerScope, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

// GET /api/housekeeping/requests?centerId=&status=&mine=1&open=1&complaints=1
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_requests");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get("centerId") || undefined;
    const status = searchParams.get("status") || undefined;
    const mine = searchParams.get("mine") === "1";
    const open = searchParams.get("open") === "1";
    const complaints = searchParams.get("complaints") === "1";
    const breached = searchParams.get("breached") === "1";

    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.cleaningRequest.findMany({
      where: {
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
        ...(status ? { status: status as any } : {}),
        ...(mine ? { assigneeId: u.id } : {}),
        ...(open ? { status: { notIn: ["CLOSED", "CANCELLED"] } } : {}),
        ...(complaints ? { isComplaint: true } : {}),
        ...(breached ? { slaBreached: true } : {}),
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        center: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        client: { select: { id: true, companyName: true } },
        events: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { photos: true } },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}
