import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { RATE_THRESHOLD } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const rentPerSeat = Number(b.rentPerSeat);
  const belowThreshold = rentPerSeat < RATE_THRESHOLD;
  const status = belowThreshold ? "PENDING_APPROVAL" : "DRAFT";
  const p = await prisma.proposal.create({
    data: {
      leadId: b.leadId || null,
      centerId: b.centerId,
      cabinId: b.cabinId || null,
      seats: Number(b.seats),
      rentPerSeat,
      securityDeposit: Number(b.securityDeposit),
      lockInMonths: Number(b.lockInMonths) || 12,
      customisations: b.customisations || null,
      status,
      belowThreshold,
      createdById: u.id,
    },
  });
  return NextResponse.json(p);
}
