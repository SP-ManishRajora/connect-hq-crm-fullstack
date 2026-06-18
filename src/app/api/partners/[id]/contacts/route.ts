import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isValidIndianPhone, normaliseIndianPhone, isValidEmail } from "@/lib/validators";

// Add a contact person to an existing partner firm.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (!b.name || !String(b.name).trim()) {
    return NextResponse.json({ error: "contact person name is required" }, { status: 400 });
  }

  const phoneRaw = String(b.phone || "").trim();
  if (phoneRaw && !isValidIndianPhone(phoneRaw)) {
    return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number (starts 6-9)." }, { status: 400 });
  }
  const emailRaw = String(b.email || "").trim();
  if (emailRaw && !isValidEmail(emailRaw)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const firm = await prisma.partner.findUnique({ where: { id: params.id } });
  if (!firm) return NextResponse.json({ error: "partner firm not found" }, { status: 404 });

  const contact = await prisma.partnerContact.create({
    data: {
      partnerId: params.id,
      name: String(b.name).trim(),
      phone: phoneRaw ? normaliseIndianPhone(phoneRaw) : null,
      email: emailRaw || null,
    },
  });
  return NextResponse.json(contact);
}
