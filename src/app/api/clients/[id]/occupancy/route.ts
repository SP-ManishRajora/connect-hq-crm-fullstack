import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { occupiedSeats } = await req.json();
  const client = await prisma.client.findUniqueOrThrow({ where: { id: params.id }, include: { proposal: true } });
  const total = client.totalCabinSeats || client.proposal?.seats || 0;
  const occ = Math.min(Number(occupiedSeats), total);
  await prisma.client.update({ where: { id: params.id }, data: { occupiedSeats: occ } });

  // Update seats: mark occupied/partial in cabin
  if (client.cabinId) {
    const cabinSeats = await prisma.seat.findMany({ where: { cabinId: client.cabinId }, orderBy: { number: "asc" } });
    for (let i = 0; i < cabinSeats.length; i++) {
      await prisma.seat.update({
        where: { id: cabinSeats[i].id },
        data: {
          occupied: i < occ,
          partialOccupancy: i >= occ,   // orange
          assignedClientId: client.id,
        },
      });
    }
  }
  return NextResponse.json({ ok: true, occupiedSeats: occ });
}
