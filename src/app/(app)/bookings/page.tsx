import { prisma } from "@/lib/db";
import { istMonthRange } from "@/lib/utils";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import BookingsClient from "./BookingsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();

  // Staff who may book on behalf of any client (or, for a CM, their own center).
  const canBookOnBehalf = requireRole(me?.role, ["ADMIN", "OWNER", "CENTER_MANAGER", "SALES", "OPS"]);
  // Only ADMIN and CENTER_MANAGER may browse/book past dates (late entry, with a reason).
  const canBackdate = requireRole(me?.role, ["ADMIN", "CENTER_MANAGER"]);
  // Center Manager and above may bulk-enter backlog (historic) bookings.
  const canBacklog = requireRole(me?.role, ["ADMIN", "OWNER", "CENTER_MANAGER"]);

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
      const { start: monthStart, end: monthEnd } = istMonthRange(now);
      const used = await prisma.booking.findMany({ where: { clientId: client.id, startTime: { gte: monthStart, lt: monthEnd }, status: "CONFIRMED" } });
      quota = { totalHrs, usedHrs: used.reduce((s, x) => s + (x.durationHrs || 0), 0) };
    }
  }

  // Remaining meeting-room quota per client, per the IST month each booking falls in.
  // Keyed `${clientId}:${YYYY-MM}` so a row can show the client's balance for its own month.
  const clientQuotas: Record<string, { totalHrs: number; usedHrs: number; remainingHrs: number }> = {};
  const bookingClientIds = Array.from(new Set(bookings.map((b) => b.clientId).filter(Boolean))) as string[];
  if (bookingClientIds.length) {
    const quotaClients = await prisma.client.findMany({
      where: { id: { in: bookingClientIds } },
      select: { id: true, occupiedSeats: true },
    });
    const seatHrs = new Map(quotaClients.map((c) => [c.id, (c.occupiedSeats || 0) * 2]));

    // Every month that appears in the list, so used hours cover bookings beyond the 500 fetched.
    const monthKeys = new Set<string>();
    for (const b of bookings) {
      if (!b.clientId) continue;
      monthKeys.add(istMonthRange(b.startTime).start.toISOString());
    }
    const monthUsage = await Promise.all(
      Array.from(monthKeys).map(async (iso) => {
        const { start: monthStart, end: monthEnd } = istMonthRange(new Date(iso));
        const rows = await prisma.booking.groupBy({
          by: ["clientId"],
          where: { clientId: { in: bookingClientIds }, startTime: { gte: monthStart, lt: monthEnd }, status: "CONFIRMED" },
          _sum: { durationHrs: true },
        });
        return { monthStart, rows };
      })
    );
    for (const { monthStart, rows } of monthUsage) {
      const ym = monthStart.toISOString();
      for (const r of rows) {
        if (!r.clientId) continue;
        const totalHrs = seatHrs.get(r.clientId) || 0;
        const usedHrs = r._sum.durationHrs || 0;
        clientQuotas[`${r.clientId}:${ym}`] = { totalHrs, usedHrs, remainingHrs: Math.max(0, totalHrs - usedHrs) };
      }
    }
    // Clients with no confirmed usage in a listed month still have their full quota.
    for (const b of bookings) {
      if (!b.clientId) continue;
      const ym = istMonthRange(b.startTime).start.toISOString();
      const key = `${b.clientId}:${ym}`;
      if (!clientQuotas[key]) {
        const totalHrs = seatHrs.get(b.clientId) || 0;
        clientQuotas[key] = { totalHrs, usedHrs: 0, remainingHrs: totalHrs };
      }
    }
  }

  return (
    <BookingsClient
      bookings={JSON.parse(JSON.stringify(bookings))}
      clientQuotas={clientQuotas}
      rooms={JSON.parse(JSON.stringify(rooms))}
      centers={JSON.parse(JSON.stringify(centers))}
      clients={JSON.parse(JSON.stringify(clients))}
      quota={quota}
      me={me ? { id: me.id, role: me.role, centerId: me.centerId } : null}
      canBookOnBehalf={canBookOnBehalf}
      canBackdate={canBackdate}
      canBacklog={canBacklog}
    />
  );
}
