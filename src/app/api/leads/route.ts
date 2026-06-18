import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isValidIndianPhone, normaliseIndianPhone, isValidEmail } from "@/lib/validators";

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

    const phoneRaw = String(b.phone || "").trim();
    const emailRaw = String(b.email || "").trim();
    if (!phoneRaw && !emailRaw) {
      return NextResponse.json({ error: "Provide a phone or email." }, { status: 400 });
    }
    if (phoneRaw && !isValidIndianPhone(phoneRaw)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number (starts 6-9)." }, { status: 400 });
    }
    if (emailRaw && !isValidEmail(emailRaw)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const lead = await prisma.lead.create({
      data: {
        source: b.source || "CALL",
        name: b.name,
        email: emailRaw || null,
        phone: phoneRaw ? normaliseIndianPhone(phoneRaw) : null,
        company: b.company || null,
        seatsNeeded: b.seatsNeeded ? Number(b.seatsNeeded) : null,
        budget: b.budget ? Number(b.budget) : null,
        notes: b.notes || null,
        centerId: b.centerId || null,
        sourceType: b.sourceType || null,
        partnerContactId: b.partnerContactId || null,
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
