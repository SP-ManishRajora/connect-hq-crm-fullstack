import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { side } = await req.json();
  const data = side === "CM" ? { cmConfirmed: true } : { clientConfirmed: true };
  const c = await prisma.client.update({ where: { id: params.id }, data });
  return NextResponse.json(c);
}
