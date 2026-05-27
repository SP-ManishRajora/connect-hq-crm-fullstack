import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const centers = await prisma.center.findMany({ where: { active: true }, select: { id: true, name: true, city: true } });
  return NextResponse.json(centers);
}
