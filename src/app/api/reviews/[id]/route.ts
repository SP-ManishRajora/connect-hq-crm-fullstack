import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// DELETE /api/reviews/:id — soft-delete (status -> Deleted, sets deletedAt).
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !canAccess(u.role, "reviews")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const existing = await prisma.review.findUnique({ where: { id: params.id } });
  if (!existing || existing.status === "Deleted") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await prisma.review.update({
    where: { id: params.id },
    data: { status: "Deleted", deletedAt: new Date() },
  });
  await logAction({
    userId: u.id,
    action: "REVIEW_DELETE",
    targetType: "Review",
    targetId: params.id,
  });
  return NextResponse.json({ ok: true });
}
