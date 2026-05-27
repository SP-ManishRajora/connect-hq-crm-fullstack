import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  const b = await req.json();
  // allow public submission via QR / portal if clientId is passed
  const t = await prisma.ticket.create({
    data: {
      clientId: b.clientId || null,
      raisedById: u?.id || null,
      category: b.category || "COMPLAINT",
      subject: b.subject,
      body: b.body || "",
    },
  });
  return NextResponse.json(t);
}
