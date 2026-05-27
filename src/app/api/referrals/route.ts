import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const r = await prisma.referral.create({
    data: {
      referrerType: b.referrerType,
      referrerId: b.referrerType === "CLIENT" ? b.referrerId || null : null,
      referrerName: b.referrerName,
      contact: b.contact || null,
      prospectName: b.prospectName,
      prospectPhone: b.prospectPhone || null,
      feeAmount: Number(b.feeAmount) || 0,
      notes: b.notes || null,
    },
  });
  return NextResponse.json(r);
}
