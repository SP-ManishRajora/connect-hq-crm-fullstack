import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { picUserId } = await req.json();
  const c = await prisma.client.update({ where: { id: params.id }, data: { picUserId: picUserId || null } });
  return NextResponse.json(c);
}
