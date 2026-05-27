import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const n = await prisma.notice.create({
    data: {
      title: b.title,
      body: b.body,
      isAd: !!b.isAd,
      brand: b.brand || null,
      centerId: b.centerId || null,
      endDate: b.endDate ? new Date(b.endDate) : null,
    },
  });
  return NextResponse.json(n);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const centerId = url.searchParams.get("centerId");
  const where = centerId ? { OR: [{ centerId }, { centerId: null }] } : {};
  const ns = await prisma.notice.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json(ns);
}
