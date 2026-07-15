import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import BookingsClient from "./BookingsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();

  // Staff who may book on behalf of any client (or, for a CM, their own center).
  const canBookOnBehalf = requireRole(me?.role, ["ADMIN", "OWNER", "CENTER_MANAGER", "SALES", "OPS"]);

  const [bookings, rooms, centers, clients] = await Promise.all([
    prisma.booking.findMany({ orderBy: { startTime: "desc" }, include: { room: true, center: true, bookedBy: true, client: true }, take: 500 }),
    prisma.meetingRoom.findMany({ where: { active: true }, include: { center: true } }),
    prisma.center.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    // Client list for the on-behalf picker — only for staff, scoped to a CM's center.
    canBookOnBehalf
      ? prisma.client.findMany({
          where: {
            active: true,
            ...(me?.role === "CENTER_MANAGER" && me?.centerId ? { centerId: me.centerId } : {}),
          },
          select: { id: true, companyName: true, centerId: true },
          orderBy: { companyName: "asc" },
        })
      : Promise.resolve([]),
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

  return (
    <BookingsClient
      bookings={JSON.parse(JSON.stringify(bookings))}
      rooms={JSON.parse(JSON.stringify(rooms))}
      centers={JSON.parse(JSON.stringify(centers))}
      clients={JSON.parse(JSON.stringify(clients))}
      quota={quota}
      me={me ? { id: me.id, role: me.role, centerId: me.centerId } : null}
      canBookOnBehalf={canBookOnBehalf}
    />
  );
}
