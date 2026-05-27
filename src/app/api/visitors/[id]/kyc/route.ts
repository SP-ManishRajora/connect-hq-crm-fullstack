import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// DigiLocker integration stub. In production:
//  1. Call DigiLocker partner API with Aadhaar + OTP / e-Aadhaar fetch
//  2. Verify XML signature
//  3. Store ref ID below
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const v = await prisma.visitor.findUnique({ where: { id: params.id } });
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!v.aadhaar && !v.pan) return NextResponse.json({ error: "Aadhaar/PAN missing" }, { status: 400 });
  const updated = await prisma.visitor.update({
    where: { id: params.id },
    data: {
      kycVerified: true,
      digilockerRef: `STUB-${Date.now()}`,
    },
  });
  return NextResponse.json(updated);
}
