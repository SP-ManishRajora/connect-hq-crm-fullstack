import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// Purchase Request status lifecycle. Kept as strings (matches the schema default "OPEN").
export const PR_STATUSES = ["OPEN", "APPROVED", "REJECTED", "ORDERED", "CLOSED"] as const;

// PATCH /api/pr/[id] — update a Purchase Request's status. Restricted to Accounts + Admin/Owner.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER", "ACCOUNTS"])) {
    return NextResponse.json({ error: "Only Accounts or Admin can update PR status" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const status = String(b?.status || "").trim();
  if (!(PR_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.purchaseRequest.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "PR not found" }, { status: 404 });

  const pr = await prisma.purchaseRequest.update({ where: { id: params.id }, data: { status } });
  await logAction({ userId: u.id, action: "PR_STATUS_UPDATED", targetType: "PurchaseRequest", targetId: params.id, meta: { from: existing.status, to: status } });
  return NextResponse.json(pr);
}
