import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendMail, fmtINR } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await prisma.contract.findUnique({ where: { id: params.id }, include: { client: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const newRent = c.monthlyRent * (1 + c.incrementPct / 100);
  const next = new Date(c.revisionDate);
  next.setFullYear(next.getFullYear() + 1);
  const updated = await prisma.contract.update({
    where: { id: c.id },
    data: { monthlyRent: newRent, revisionDate: next, reminderSent: false },
  });
  await sendMail(c.client.email, "Rent revision", `Hello ${c.client.contactName},\n\nAs per your contract, monthly rent has been revised from ${fmtINR(c.monthlyRent)} to ${fmtINR(newRent)} (+${c.incrementPct}%) effective ${c.revisionDate.toDateString()}.`);
  return NextResponse.json(updated);
}
