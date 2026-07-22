import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// POST /api/clients/direct — onboard a client WITHOUT a lead/proposal.
// All commercial terms (center, cabin, rent, deposit) are entered manually.
// Roles: same set that can manage clients onboarding.
const ONBOARD_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "CENTER_MANAGER"] as const;

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...ONBOARD_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to onboard clients" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));

  const companyName = String(b.companyName || "").trim();
  const contactName = String(b.contactName || "").trim();
  const email = String(b.email || "").trim();
  const centerId = String(b.centerId || "").trim();
  if (!companyName || !contactName || !email || !centerId) {
    return NextResponse.json({ error: "Company, contact, email and center are required" }, { status: 400 });
  }

  // Validate center, and cabin (if given) belongs to that center.
  const center = await prisma.center.findUnique({ where: { id: centerId }, select: { id: true } });
  if (!center) return NextResponse.json({ error: "Center not found" }, { status: 400 });

  const cabinId = b.cabinId ? String(b.cabinId) : null;
  let cabinCapacity = 0;
  if (cabinId) {
    const cabin = await prisma.cabin.findUnique({ where: { id: cabinId }, select: { id: true, centerId: true, capacity: true } });
    if (!cabin || cabin.centerId !== centerId) {
      return NextResponse.json({ error: "Cabin does not belong to the selected center" }, { status: 400 });
    }
    cabinCapacity = cabin.capacity;
  }

  // Channel partner (optional): where the client came from. Mirror the lead flow.
  const sourceType = b.sourceType ? String(b.sourceType).trim() : null;
  const partnerContactId = b.partnerContactId ? String(b.partnerContactId).trim() : null;
  if (partnerContactId) {
    const contact = await prisma.partnerContact.findUnique({
      where: { id: partnerContactId },
      select: { partner: { select: { type: true } } },
    });
    if (!contact) return NextResponse.json({ error: "Partner contact not found" }, { status: 400 });
    if (sourceType && contact.partner.type !== sourceType) {
      return NextResponse.json({ error: "Partner contact does not match the selected source type" }, { status: 400 });
    }
  }

  const start = b.startDate ? new Date(b.startDate) : new Date();
  if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  const revisionDate = new Date(start);
  revisionDate.setFullYear(revisionDate.getFullYear() + 1);

  const monthlyRent = Number(b.monthlyRent) || 0;
  const securityDeposit = Number(b.securityDeposit) || 0;
  const incrementPct = Number(b.incrementPct) || 5;

  // Seats: total defaults to cabin capacity; occupied defaults to total.
  const total = b.totalCabinSeats !== undefined ? Number(b.totalCabinSeats) : cabinCapacity;
  const occ = b.occupiedSeats !== undefined ? Number(b.occupiedSeats) : total;

  const client = await prisma.client.create({
    data: {
      companyName,
      contactName,
      email,
      phone: b.phone ? String(b.phone) : null,
      centerId,
      cabinId,
      // no proposalId — this is a direct onboarding
      startDate: start,
      specialAgreement: b.specialAgreement ? String(b.specialAgreement) : null,
      sourceType,
      partnerContactId,
      occupiedSeats: occ,
      totalCabinSeats: total,
      contract: {
        create: {
          startDate: start,
          monthlyRent,
          securityDeposit,
          incrementPct,
          revisionDate,
        },
      },
    },
    include: { contract: true },
  });

  // Colour cabin seats: occupied (green) up to occ, partialOccupancy (orange) for the rest.
  if (cabinId) {
    const cabinSeats = await prisma.seat.findMany({ where: { cabinId }, orderBy: { number: "asc" } });
    for (let i = 0; i < cabinSeats.length; i++) {
      await prisma.seat.update({
        where: { id: cabinSeats[i].id },
        data: { occupied: i < occ, partialOccupancy: i >= occ, assignedClientId: client.id },
      });
    }
  }

  await logAction({ userId: u.id, action: "CLIENT_CREATED", targetType: "Client", targetId: client.id, meta: { companyName: client.companyName, source: "direct" } });
  return NextResponse.json(client);
}
