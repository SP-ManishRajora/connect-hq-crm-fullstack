import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

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

  // Reassign open leads (not WON / LOST)
  const leadsRes = await prisma.lead.updateMany({
    where: { ownerId: from.id, status: { notIn: ["WON", "LOST"] } },
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
