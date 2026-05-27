import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const s = await prisma.sop.create({ data: { title: b.title, body: b.body, category: b.category || "OTHER" } });
  return NextResponse.json(s);
}
