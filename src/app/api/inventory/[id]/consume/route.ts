import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const item = await prisma.inventoryItem.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const log = item.consumptionLog ? JSON.parse(item.consumptionLog) : [];
  log.unshift({ date: new Date().toISOString(), qty: Number(b.qty), photo: b.photo || null, by: u.name });
  const updated = await prisma.inventoryItem.update({
    where: { id: params.id },
    data: { currentStock: Math.max(0, item.currentStock - Number(b.qty)), consumptionLog: JSON.stringify(log) },
  });
  return NextResponse.json(updated);
}
