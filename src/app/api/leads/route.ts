import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, include: { center: true } });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  try {
    const u = await getSessionUser();
    if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const b = await req.json();
    if (!b.name || !String(b.name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const lead = await prisma.lead.create({
      data: {
        source: b.source || "CALL",
        name: b.name,
        email: b.email || null,
        phone: b.phone || null,
        company: b.company || null,
        seatsNeeded: b.seatsNeeded ? Number(b.seatsNeeded) : null,
        budget: b.budget ? Number(b.budget) : null,
        notes: b.notes || null,
        centerId: b.centerId || null,
        ownerId: u.id,
      },
    });
    return NextResponse.json(lead);
  } catch (err: any) {
    console.error("POST /api/leads failed:", err);
    return NextResponse.json(
      { error: err?.message || "internal error", code: err?.code },
      { status: 500 },
    );
  }
}
