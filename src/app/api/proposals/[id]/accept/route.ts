import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await prisma.proposal.update({
    where: { id: params.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
    include: { lead: true },
  });
  if (p.leadId) {
    await prisma.lead.update({ where: { id: p.leadId }, data: { status: "WON" } });
  }
  await logAction({ userId: u.id, action: "PROPOSAL_ACCEPTED", targetType: "Proposal", targetId: params.id });
  return NextResponse.json(p);
}
