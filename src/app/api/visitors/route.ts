import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const v = await prisma.visitor.create({
    data: {
      name: b.name,
      phone: b.phone || null,
      email: b.email || null,
      aadhaar: b.aadhaar || null,
      pan: b.pan || null,
      leadId: b.leadId || null,
      centerId: b.centerId || null,
      tourTaken: !!b.tourTaken,
      tourDate: b.tourTaken ? new Date() : null,
      notes: b.notes || null,
    },
  });
  return NextResponse.json(v);
}
