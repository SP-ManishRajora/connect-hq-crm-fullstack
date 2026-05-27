import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const e = await prisma.expense.create({
    data: {
      centerId: b.centerId || null,
      category: b.category || "OTHER",
      amount: Number(b.amount) || 0,
      gst: Number(b.gst) || 0,
      tds: Number(b.tds) || 0,
      payee: b.payee,
      paymentMode: b.paymentMode || "CASH",
      notes: b.notes || null,
    },
  });
  await prisma.ledgerEntry.create({
    data: { account: `Expense - ${b.category}`, debit: e.amount, credit: 0, refType: "EXPENSE", refId: e.id, centerId: e.centerId, narration: `${b.payee} (${b.paymentMode})` },
  });
  return NextResponse.json(e);
}
