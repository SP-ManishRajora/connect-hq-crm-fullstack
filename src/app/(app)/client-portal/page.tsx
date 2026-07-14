import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ClientPortal from "./ClientPortal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await getSessionUser();
  if (!u) redirect("/login");

  // Resolve the client record either by the user's own email or via employer link.
  const client = await prisma.client.findFirst({
    where: { OR: [{ email: u.email }, { employees: { some: { id: u.id } } }] },
    include: { center: true },
  });

  const now = new Date();

  const [tickets, notices, invoices, upcoming, history, rooms] = await Promise.all([
    client
      ? prisma.ticket.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.notice.findMany({
      where: { OR: [{ centerId: client?.centerId }, { centerId: null }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    client
      ? prisma.clientInvoice.findMany({ where: { clientId: client.id }, orderBy: { issuedAt: "desc" }, take: 12 })
      : Promise.resolve([]),
    // Upcoming: this user's (or their client's) confirmed future bookings.
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        endTime: { gte: now },
        OR: [{ bookedById: u.id }, ...(client ? [{ clientId: client.id }] : [])],
      },
      include: { room: true, center: true },
      orderBy: { startTime: "asc" },
    }),
    // History: past or cancelled bookings.
    prisma.booking.findMany({
      where: {
        OR: [{ bookedById: u.id }, ...(client ? [{ clientId: client.id }] : [])],
        AND: [{ OR: [{ endTime: { lt: now } }, { status: "CANCELLED" }] }],
      },
      include: { room: true, center: true },
      orderBy: { startTime: "desc" },
      take: 50,
    }),
    // Available rooms — scoped to the client's center when known.
    prisma.meetingRoom.findMany({
      where: { active: true, ...(client?.centerId ? { centerId: client.centerId } : {}) },
      include: { center: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Meeting-room quota for the month (mirrors /bookings logic).
  let quota: any = null;
  if (client) {
    const totalHrs = (client.occupiedSeats || 0) * 2;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const used = await prisma.booking.findMany({
      where: { clientId: client.id, startTime: { gte: monthStart, lte: monthEnd }, status: "CONFIRMED" },
    });
    quota = { totalHrs, usedHrs: used.reduce((s, x) => s + (x.durationHrs || 0), 0) };
  }

  const j = (x: any) => JSON.parse(JSON.stringify(x));
  return (
    <ClientPortal
      user={u}
      client={j(client)}
      tickets={j(tickets)}
      notices={j(notices)}
      invoices={j(invoices)}
      upcoming={j(upcoming)}
      history={j(history)}
      rooms={j(rooms)}
      quota={quota}
    />
  );
}
