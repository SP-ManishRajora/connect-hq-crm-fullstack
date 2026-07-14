import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// Clients may cancel their own booking up to this many minutes before it starts.
const CANCEL_CUTOFF_MINUTES = 60;

// POST /api/bookings/[id]/cancel — cancel a booking.
// Business rules:
//  - Staff (ADMIN/OWNER/CENTER_MANAGER) can cancel any booking.
//  - A client can cancel only their OWN booking, and only up to CANCEL_CUTOFF_MINUTES
//    before it starts. Past / in-progress bookings can't be cancelled by clients.
//  - Already-cancelled bookings are rejected.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
  }

  const isStaff = requireRole(me.role, ["ADMIN", "OWNER", "CENTER_MANAGER"]);

  if (!isStaff) {
    // Resolve the caller's client (either their own email or as an employee).
    const myClient = await prisma.client.findFirst({
      where: { OR: [{ email: me.email }, { employees: { some: { id: me.id } } }] },
      select: { id: true },
    });
    const ownsBooking =
      booking.bookedById === me.id || (booking.clientId && booking.clientId === myClient?.id);
    if (!ownsBooking) {
      return NextResponse.json({ error: "You can only cancel your own bookings" }, { status: 403 });
    }
    const cutoff = booking.startTime.getTime() - CANCEL_CUTOFF_MINUTES * 60 * 1000;
    if (Date.now() > cutoff) {
      return NextResponse.json(
        { error: `Bookings can only be cancelled at least ${CANCEL_CUTOFF_MINUTES} minutes before the start time` },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });
  await logAction({ userId: me.id, action: "BOOKING_CANCELLED", targetType: "Booking", targetId: params.id });

  return NextResponse.json({ ok: true, booking: updated });
}
