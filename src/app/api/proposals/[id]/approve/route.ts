import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER", "MANAGER"])) {
    return NextResponse.json({ error: "Manager approval required" }, { status: 403 });
  }
  const { decision, notes } = await req.json();
  const updated = await prisma.proposal.update({
    where: { id: params.id },
    data: {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      approvedById: u.id,
      approverNotes: notes || null,
    },
  });
  await logAction({ userId: u.id, action: decision === "APPROVE" ? "PROPOSAL_APPROVED" : "PROPOSAL_REJECTED", targetType: "Proposal", targetId: params.id, meta: { notes } });
  return NextResponse.json(updated);
}
