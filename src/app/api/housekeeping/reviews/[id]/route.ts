import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

// DELETE /api/housekeeping/reviews/[id] — hide a review.
//
// Reviews are public-submitted, so staff need a way to retract abuse. This is a
// soft hide, never a delete: the row stays for the record, and the moderator is
// named. Removing evidence of a complaint should not be possible from a UI.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    if (!["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role)) {
      throw Object.assign(new Error("Only a manager can hide a review"), { __status: 403 });
    }

    const row = await prisma.clientReview.findUnique({
      where: { id: params.id },
      select: { id: true, centerId: true, rating: true, status: true },
    });
    if (!row) throw Object.assign(new Error("Review not found"), { __status: 404 });
    assertCenterAllowed(u, row.centerId);

    const updated = await prisma.clientReview.update({
      where: { id: row.id },
      data: { status: "Hidden", hiddenById: u.id, hiddenAt: new Date() },
      select: { id: true, status: true },
    });

    await logAction({
      userId: u.id,
      action: "HK_CLIENT_REVIEW_HIDDEN",
      targetType: "ClientReview",
      targetId: row.id,
      meta: { rating: row.rating },
    });

    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}
