import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail, GST_RATE, fmtINR, nextInvoiceNo } from "@/lib/utils";
import { logAction } from "@/lib/audit";

/**
 * Monthly invoice run.
 *
 * Pricing model per client:
 *   baseAmount    = occupiedSeats * rentPerSeat
 *   halfPriceLine = (totalCabinSeats - occupiedSeats) * rentPerSeat * 0.5
 *                   (when client has taken a cabin but isn't using all seats)
 *   meetingRoomLine = max(0, usedHours - quota) * roomRate
 *                   quota = occupiedSeats * 2 hrs / month
 *   gst = (base + halfPrice + meetingRoom) * 18%
 */
export async function POST() {
  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { contract: true, center: true, proposal: true },
  });
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  let created = 0;

  for (const c of clients) {
    if (!c.contract || !c.proposal) continue;
    const existing = await prisma.clientInvoice.findFirst({ where: { clientId: c.id, periodStart } });
    if (existing) continue;

    const rentPerSeat = (c.proposal as any).negotiatedPrice || 0;
    const occ = c.occupiedSeats || 0;
    const total = c.totalCabinSeats || 0;
    const unused = Math.max(0, total - occ);

    const base = occ * rentPerSeat;
    const halfPriceLine = unused * rentPerSeat * 0.5;

    // Meeting room overage
    const quotaHrs = occ * 2;
    const usedBookings = await prisma.booking.findMany({
      where: { clientId: c.id, startTime: { gte: periodStart, lte: periodEnd }, status: "CONFIRMED" },
      include: { room: true },
    });
    let usedHrs = 0;
    let overageAmount = 0;
    for (const b of usedBookings) {
      const hrs = b.durationHrs || ((b.endTime.getTime() - b.startTime.getTime()) / 3600000);
      if (usedHrs + hrs <= quotaHrs) {
        usedHrs += hrs;
      } else {
        const overHrs = (usedHrs + hrs) - quotaHrs;
        const within = hrs - overHrs;
        usedHrs += within;
        overageAmount += overHrs * (b.room.hourlyRate || 0);
      }
    }

    const subtotal = base + halfPriceLine + overageAmount;
    const gst = subtotal * GST_RATE;
    const grand = subtotal + gst;

    const inv = await prisma.clientInvoice.create({
      data: {
        clientId: c.id,
        centerId: c.centerId,
        invoiceNo: nextInvoiceNo("INV"),
        periodStart,
        periodEnd,
        baseAmount: base,
        halfPriceLine,
        meetingRoomLine: overageAmount,
        gstAmount: gst,
        totalAmount: grand,
        emailSent: true,
      },
    });
    await sendMail(
      c.email,
      `Invoice ${inv.invoiceNo} — ${c.center.name}`,
      `Hi ${c.contactName},\n\nInvoice for ${periodStart.toLocaleString("en-IN", { month: "long", year: "numeric" })}:\n\n` +
        `Seats occupied: ${occ}/${total}\n` +
        `Base (${occ} × ${fmtINR(rentPerSeat)}): ${fmtINR(base)}\n` +
        (halfPriceLine > 0 ? `Unused seats half-price (${unused} × ${fmtINR(rentPerSeat * 0.5)}): ${fmtINR(halfPriceLine)}\n` : "") +
        (overageAmount > 0 ? `Meeting room overage: ${fmtINR(overageAmount)}\n` : "") +
        `GST 18%: ${fmtINR(gst)}\n` +
        `Total: ${fmtINR(grand)}\n\n` +
        `Meeting room quota: ${quotaHrs} hrs/month (= seats × 2 hrs)\n` +
        `Used this month: ${usedHrs.toFixed(1)} hrs\n\n` +
        `Thanks,\nCoworking ERP`
    );
    await prisma.ledgerEntry.create({
      data: { account: "Sundry Debtors", debit: grand, credit: 0, refType: "INVOICE", refId: inv.id, centerId: c.centerId, narration: `Invoice ${inv.invoiceNo} - ${c.companyName}` },
    });
    await logAction({ action: "INVOICE_SENT", targetType: "ClientInvoice", targetId: inv.id, meta: { invoiceNo: inv.invoiceNo, clientId: c.id, total: grand } });
    created++;
  }
  return NextResponse.json({ created });
}
