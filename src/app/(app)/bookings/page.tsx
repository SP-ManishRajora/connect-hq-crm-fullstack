import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import BookingsClient from "./BookingsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  const [bookings, rooms, centers] = await Promise.all([
    prisma.booking.findMany({ orderBy: { startTime: "desc" }, include: { room: true, center: true, bookedBy: true, client: true }, take: 200 }),
    prisma.meetingRoom.findMany({ where: { active: true }, include: { center: true } }),
    prisma.center.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  // quota for current client (if logged in user is a client / employee of a client)
  let quota: any = null;
  if (me) {
    const client = await prisma.client.findFirst({
      where: { OR: [{ email: me.email }, { employees: { some: { id: me.id } } }] },
    });
    if (client) {
      const totalHrs = (client.occupiedSeats || 0) * 2;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const used = await prisma.booking.findMany({ where: { clientId: client.id, startTime: { gte: monthStart, lte: monthEnd }, status: "CONFIRMED" } });
      quota = { totalHrs, usedHrs: used.reduce((s, x) => s + (x.durationHrs || 0), 0) };
    }
  }

  return <BookingsClient bookings={JSON.parse(JSON.stringify(bookings))} rooms={JSON.parse(JSON.stringify(rooms))} centers={JSON.parse(JSON.stringify(centers))} quota={quota} />;
}
