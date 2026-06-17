import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const proposal = await prisma.proposal.findUnique({ where: { id: b.proposalId }, include: { cabin: true } });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 400 });
  if (proposal.status !== "ACCEPTED") return NextResponse.json({ error: "Proposal not accepted yet" }, { status: 400 });

  const start = new Date(b.startDate);
  const revisionDate = new Date(start);
  revisionDate.setFullYear(revisionDate.getFullYear() + 1);

  const total = (proposal as any).totalCabinSeats || 0;
  const occ = b.occupiedSeats !== undefined ? Number(b.occupiedSeats) : total;

  const client = await prisma.client.create({
    data: {
      companyName: b.companyName,
      contactName: b.contactName,
      email: b.email,
      phone: b.phone || null,
      centerId: proposal.centerId,
      cabinId: proposal.cabinId || null,
      proposalId: proposal.id,
      startDate: start,
      specialAgreement: b.specialAgreement || null,
      occupiedSeats: occ,
      totalCabinSeats: total,
      contract: {
        create: {
          startDate: start,
          monthlyRent: (proposal as any).negotiatedPrice || 0,
          securityDeposit: proposal.securityDeposit,
          incrementPct: Number(b.incrementPct) || 5,
          revisionDate,
        },
      },
    },
    include: { contract: true },
  });

  // Mark seats: occupied (green) up to occ, partialOccupancy (orange) for unused cabin seats
  if (proposal.cabinId) {
    const cabinSeats = await prisma.seat.findMany({ where: { cabinId: proposal.cabinId }, orderBy: { number: "asc" } });
    for (let i = 0; i < cabinSeats.length; i++) {
      await prisma.seat.update({
        where: { id: cabinSeats[i].id },
        data: { occupied: i < occ, partialOccupancy: i >= occ, assignedClientId: client.id },
      });
    }
  }
  await logAction({ userId: u.id, action: "CLIENT_CREATED", targetType: "Client", targetId: client.id, meta: { companyName: client.companyName } });
  return NextResponse.json(client);
}
