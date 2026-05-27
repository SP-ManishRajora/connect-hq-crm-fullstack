import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// For each recurring PO older than 30 days (or 7 if WEEKLY), clone for next cycle.
export async function POST() {
  const now = new Date();
  const monthly = await prisma.purchaseOrder.findMany({
    where: { isRecurring: true, recurrence: "MONTHLY", createdAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } },
  });
  const weekly = await prisma.purchaseOrder.findMany({
    where: { isRecurring: true, recurrence: "WEEKLY", createdAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  });
  let created = 0;
  for (const p of [...monthly, ...weekly]) {
    await prisma.purchaseOrder.create({
      data: {
        vendorId: p.vendorId,
        centerId: p.centerId,
        issuedById: p.issuedById,
        itemsJson: p.itemsJson,
        totalAmount: p.totalAmount,
        isRecurring: true,
        recurrence: p.recurrence,
        category: p.category,
      },
    });
    created++;
  }
  return NextResponse.json({ created });
}
