import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail, fmtINR, fmtDate } from "@/lib/utils";

// Scheduled cron: hits this daily — emails accounts team for revisions due in next 30 days
export async function POST() {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const due = await prisma.contract.findMany({
    where: { reminderSent: false, revisionDate: { lte: cutoff, gte: now } },
    include: { client: true },
  });
  for (const c of due) {
    await sendMail(
      "accounts@erp.com",
      `Rent revision due: ${c.client.companyName} on ${fmtDate(c.revisionDate)}`,
      `Client ${c.client.companyName}\nCurrent rent: ${fmtINR(c.monthlyRent)}\nIncrement: ${c.incrementPct}%\nRevision date: ${fmtDate(c.revisionDate)}`
    );
    await prisma.contract.update({ where: { id: c.id }, data: { reminderSent: true } });
  }
  return NextResponse.json({ remindersSent: due.length });
}
