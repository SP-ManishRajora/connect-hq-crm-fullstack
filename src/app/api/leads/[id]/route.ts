import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const lead = await prisma.lead.update({ where: { id: params.id }, data: b });
  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.lead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
