import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public, unauthenticated lead capture (used by /lead-form and your website embed)
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name || (!b.email && !b.phone)) {
    return NextResponse.json({ error: "Provide name and (email or phone)" }, { status: 400 });
  }
  const lead = await prisma.lead.create({
    data: {
      source: "WEB_FORM",
      name: b.name,
      email: b.email || null,
      phone: b.phone || null,
      company: b.company || null,
      seatsNeeded: b.seatsNeeded ? Number(b.seatsNeeded) : null,
      budget: b.budget ? Number(b.budget) : null,
      notes: b.notes || null,
      centerId: b.centerId || null,
    },
  });
  return NextResponse.json({ ok: true, id: lead.id });
}
