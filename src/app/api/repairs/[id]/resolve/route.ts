import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await prisma.repair.update({ where: { id: params.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  return NextResponse.json(r);
}
