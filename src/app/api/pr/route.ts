import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const pr = await prisma.purchaseRequest.create({
    data: {
      centerId: b.centerId,
      raisedById: u.id,
      itemsJson: JSON.stringify(b.items || []),
      reason: b.reason,
    },
  });
  return NextResponse.json(pr);
}
