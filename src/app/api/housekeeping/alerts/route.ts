import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, centerScope, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

// GET /api/housekeeping/alerts?centerId=&status=NEW&since=
//
// Also the polling endpoint for in-app live alerts (8.4): the client passes
// `since` and gets only newer rows, so polling is cheap. SSE was considered but
// polling matches the repo's existing patterns and survives a serverless deploy.
export async function GET(req: NextRequest) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get("centerId") || undefined;
    const status = searchParams.get("status") || undefined;
    const sinceRaw = searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;

    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.hkAlert.findMany({
      where: {
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
        ...(status ? { status: status as any } : {}),
        ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        center: { select: { id: true, name: true } },
        ackBy: { select: { id: true, name: true } },
        notifications: {
          select: { channel: true, status: true, sentAt: true, recipients: true, error: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}
