import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const TYPES = ["Broker", "Agent", "IPC"];

// List partner firms (optionally by type), each with their contact people.
export async function GET(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const partners = await prisma.partner.findMany({
    where: type ? { type } : undefined,
    orderBy: { organisation: "asc" },
    include: { contacts: { orderBy: { name: "asc" } } },
  });
  return NextResponse.json(partners);
}

// Create a partner firm. Optionally seed it with a first contact person.
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (!TYPES.includes(b.type)) {
    return NextResponse.json({ error: "type must be Broker, Agent, or IPC" }, { status: 400 });
  }
  if (!b.organisation || !String(b.organisation).trim()) {
    return NextResponse.json({ error: "organisation is required" }, { status: 400 });
  }

  const contact = b.contact && String(b.contact.name || "").trim()
    ? {
        name: String(b.contact.name).trim(),
        phone: b.contact.phone?.trim() || null,
        email: b.contact.email?.trim() || null,
      }
    : null;

  try {
    const partner = await prisma.partner.create({
      data: {
        type: b.type,
        organisation: String(b.organisation).trim(),
        contacts: contact ? { create: contact } : undefined,
      },
      include: { contacts: { orderBy: { name: "asc" } } },
    });
    return NextResponse.json(partner);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A firm with this name already exists for this type." }, { status: 409 });
    }
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
