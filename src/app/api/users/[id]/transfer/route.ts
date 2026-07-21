import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { LEAD_LOST } from "@/lib/leadStatus";

// POST  body: { toUserId: string, reason?: string, deactivate?: boolean }
// Reassigns "in-flight" work owned by user [id] to toUserId. Logs to UserTransfer.
// Optionally deactivates the source user (e.g. user has left).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const { toUserId, reason, deactivate } = await req.json();
  if (!toUserId || toUserId === params.id) return NextResponse.json({ error: "Invalid target user" }, { status: 400 });
  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.id } }),
    prisma.user.findUnique({ where: { id: toUserId } }),
  ]);
  if (!from || !to) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!to.active) return NextResponse.json({ error: "Target user is inactive" }, { status: 400 });

  // Reassign open leads — i.e. anything not closed out. Lead.status is a free-form
  // String using the vocabulary in @/lib/leadStatus ("Lead", "Connect", … "Lost"),
  // NOT the uppercase WON/LOST this route originally assumed. "WON" is included
  // because src/app/api/proposals/[id]/accept writes that value on acceptance.
  const CLOSED_LEAD_STATUSES = [LEAD_LOST, "WON"];
  const leadsRes = await prisma.lead.updateMany({
    where: { ownerId: from.id, status: { notIn: CLOSED_LEAD_STATUSES } },
    data: { ownerId: to.id },
  });

  // Reassign future bookings
  const bookingsRes = await prisma.booking.updateMany({
    where: { bookedById: from.id, startTime: { gte: new Date() }, status: "CONFIRMED" },
    data: { bookedById: to.id },
  });

  // Reassign open Purchase Requests
  const prsRes = await prisma.purchaseRequest.updateMany({
    where: { raisedById: from.id, status: { notIn: ["CLOSED"] } },
    data: { raisedById: to.id },
  });

  const recordsAffected = { leads: leadsRes.count, bookings: bookingsRes.count, purchaseRequests: prsRes.count };

  await prisma.userTransfer.create({
    data: {
      fromUserId: from.id, toUserId: to.id,
      reason: reason || null,
      transferredById: me.id,
      recordsAffectedJson: JSON.stringify(recordsAffected),
    },
  });
  await prisma.user.update({
    where: { id: from.id },
    data: {
      transferredToId: to.id, transferredAt: new Date(),
      ...(deactivate ? { active: false, deletedAt: new Date() } : {}),
    },
  });
  return NextResponse.json({ ok: true, recordsAffected });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const list = await prisma.userTransfer.findMany({
    where: { OR: [{ fromUserId: params.id }, { toUserId: params.id }] },
    orderBy: { createdAt: "desc" },
    include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } }, transferredBy: { select: { name: true } } },
  });
  return NextResponse.json(list);
}
