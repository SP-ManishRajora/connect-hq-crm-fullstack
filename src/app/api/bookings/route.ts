import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET — list all bookings (visible to all logged-in users incl. clients)
export async function GET() {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bookings = await prisma.booking.findMany({
    orderBy: { startTime: "desc" },
    include: { room: true, center: true, bookedBy: true, client: true },
    take: 200,
  });
  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const room = await prisma.meetingRoom.findUnique({ where: { id: b.roomId } });
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 400 });

  const start = new Date(b.startTime);
  const end = new Date(b.endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date/time" }, { status: 400 });
  }
  const durationHrs = (end.getTime() - start.getTime()) / 3600000;
  if (durationHrs <= 0) return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
  // Business rule: no bookings for past start times.
  if (start.getTime() < Date.now()) {
    return NextResponse.json({ error: "Cannot book a slot in the past" }, { status: 400 });
  }

  // overlap check
  const clash = await prisma.booking.findFirst({
    where: { roomId: b.roomId, status: "CONFIRMED", AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }] },
  });
  if (clash) return NextResponse.json({ error: "Room already booked for that slot" }, { status: 409 });

  // Resolve the CLIENT record for the caller (if they are a client / employee).
  const ownClient =
    u.role === "CLIENT"
      ? await prisma.client.findFirst({ where: { OR: [{ email: u.email }, { employees: { some: { id: u.id } } }] } })
      : null;

  // Determine clientId with authorization for on-behalf bookings:
  //   CLIENT           → only their own client (a supplied clientId must match).
  //   CENTER_MANAGER   → any client in their own center.
  //   ADMIN / OWNER    → any client.
  //   SALES / OPS      → any client (they manage bookings for the center).
  let clientId: string | null = null;
  const requestedClientId: string | null = b.clientId || null;

  if (u.role === "CLIENT") {
    // Clients can never book for another client; always pin to their own.
    if (requestedClientId && ownClient && requestedClientId !== ownClient.id) {
      return NextResponse.json({ error: "You can only book for your own company" }, { status: 403 });
    }
    clientId = ownClient?.id || null;
  } else if (requestedClientId) {
    const target = await prisma.client.findUnique({ where: { id: requestedClientId } });
    if (!target) return NextResponse.json({ error: "Client not found" }, { status: 400 });
    if (u.role === "CENTER_MANAGER" && u.centerId && target.centerId !== u.centerId) {
      return NextResponse.json({ error: "You can only book for clients in your own center" }, { status: 403 });
    }
    clientId = target.id;
  }

  let isChargeable = false;
  let chargedAmount = 0;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (client) {
      const quotaHrs = (client.occupiedSeats || 0) * 2;
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const used = await prisma.booking.findMany({
        where: { clientId, startTime: { gte: monthStart, lte: monthEnd }, status: "CONFIRMED" },
      });
      const usedHrs = used.reduce((s, x) => s + x.durationHrs, 0);
      const remaining = Math.max(0, quotaHrs - usedHrs);
      const overHrs = Math.max(0, durationHrs - remaining);
      if (overHrs > 0) {
        isChargeable = true;
        chargedAmount = overHrs * (room.hourlyRate || 0);
      }
    }
  } else {
    // walk-in / non-client booking — fully chargeable
    isChargeable = true;
    chargedAmount = durationHrs * (room.hourlyRate || 0);
  }

  const booking = await prisma.booking.create({
    data: {
      roomId: b.roomId,
      centerId: room.centerId,
      bookedById: u.id,
      clientId,
      startTime: start,
      endTime: end,
      durationHrs,
      isChargeable,
      chargedAmount,
      notes: b.notes || null,
    },
  });
  return NextResponse.json(booking);
}
