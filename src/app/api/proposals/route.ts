import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { RATE_THRESHOLD } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const negotiatedPrice = Number(b.negotiatedPrice);
  const belowThreshold = negotiatedPrice < RATE_THRESHOLD;
  const status = belowThreshold ? "PENDING_APPROVAL" : "DRAFT";
  const p = await prisma.proposal.create({
    data: {
      leadId: b.leadId || null,
      centerId: b.centerId,
      cabinId: b.cabinId || null,
      quotedPrice: Number(b.quotedPrice),
      negotiatedPrice,
      securityDeposit: Number(b.securityDeposit),
      lockInMonths: Number(b.lockInMonths) || 12,
      customisations: b.customisations || null,
      imagesJson: b.images ? JSON.stringify(b.images) : null,
      status,
      belowThreshold,
      createdById: u.id,
    },
  });
  return NextResponse.json(p);
}
