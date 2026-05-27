import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const po = await prisma.purchaseOrder.create({
    data: {
      vendorId: b.vendorId,
      centerId: b.centerId,
      issuedById: u.id,
      itemsJson: JSON.stringify(b.items || []),
      totalAmount: Number(b.totalAmount) || 0,
      isRecurring: !!b.isRecurring,
      recurrence: b.isRecurring ? b.recurrence || "MONTHLY" : null,
      category: b.category || "OTHER",
      prId: b.prId || null,
    },
  });
  return NextResponse.json(po);
}
