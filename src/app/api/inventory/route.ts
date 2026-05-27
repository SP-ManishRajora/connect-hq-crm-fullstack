import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const i = await prisma.inventoryItem.create({ data: { ...b, currentStock: Number(b.currentStock || 0), threshold: Number(b.threshold || 0) } });
  return NextResponse.json(i);
}
