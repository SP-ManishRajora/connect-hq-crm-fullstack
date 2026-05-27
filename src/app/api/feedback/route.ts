import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const b = await req.json();
  const f = await prisma.feedback.create({ data: { clientId: b.clientId || null, rating: Number(b.rating), body: b.body || null } });
  return NextResponse.json(f);
}
