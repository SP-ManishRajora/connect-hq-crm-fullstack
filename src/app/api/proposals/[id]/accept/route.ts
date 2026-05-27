import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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
  return NextResponse.json(p);
}
