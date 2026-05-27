import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: {
      deliveryConfirmed: true,
      deliveryNotes: b.notes || null,
      deliveryPhotos: b.photos ? JSON.stringify(b.photos) : null,
    },
  });
  return NextResponse.json(updated);
}
