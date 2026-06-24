import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";

// Daily cron — for clients with occupiedSeats < totalCabinSeats for >3 months, alert the sales team.
export async function POST() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const partial = await prisma.client.findMany({
    where: {
      active: true,
      startDate: { lte: threeMonthsAgo },
      // partial occupancy = booked fewer than total seats they have access to
      // Prisma can't compare two columns directly in SQLite; filter in JS:
    },
    include: { center: true, contract: true, cabin: true },
  });
  const flagged = partial.filter(
    (c) => c.totalCabinSeats > 0 && c.occupiedSeats < c.totalCabinSeats &&
           (!c.unusedSeatLastReminderAt || c.unusedSeatLastReminderAt < threeMonthsAgo)
  );
  for (const c of flagged) {
    const sales = await prisma.user.findMany({ where: { OR: [{ role: "SALES" }, { role: "MANAGER" }], active: true } });
    for (const s of sales) {
      await sendMail(
        s.email,
        `Upsell opportunity: ${c.companyName} — ${c.totalCabinSeats - c.occupiedSeats} unused seat(s)`,
        `Client ${c.companyName} at ${c.center.name} has ${c.occupiedSeats}/${c.totalCabinSeats} seats occupied for >3 months.\n\nReach out to discuss full occupancy or convert unused seats at half-price (already auto-billed at 50%).`
      );
    }
    await prisma.client.update({ where: { id: c.id }, data: { unusedSeatReminderSent: true, unusedSeatLastReminderAt: now } });
  }
  return NextResponse.json({ remindersSent: flagged.length });
}
