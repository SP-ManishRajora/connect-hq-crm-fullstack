import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await prisma.referral.update({ where: { id: params.id }, data: { feePaid: true } });
  await prisma.expense.create({
    data: { category: "OTHER", amount: r.feeAmount, payee: r.referrerName, paymentMode: "BANK", notes: `Referral fee — ${r.prospectName}` },
  });
  return NextResponse.json(r);
}
