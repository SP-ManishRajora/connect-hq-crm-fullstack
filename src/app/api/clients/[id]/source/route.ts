import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// PATCH /api/clients/:id/source — edit where the client came from
// (channel partner: Broker / Agent / IPC + contact person). Mirrors the lead flow.
const EDIT_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "CENTER_MANAGER"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...EDIT_ROLES])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
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

  await prisma.client.update({
    where: { id: params.id },
    data: { sourceType, partnerContactId },
  });

  await logAction({
    userId: u.id,
    action: "CLIENT_SOURCE_EDIT",
    targetType: "Client",
    targetId: params.id,
    meta: { sourceType, partnerContactId },
  });

  return NextResponse.json({ ok: true });
}
