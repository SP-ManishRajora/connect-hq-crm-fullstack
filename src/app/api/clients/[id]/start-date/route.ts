import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// PATCH /api/clients/:id/start-date — edit a client's onboarding (contract start) date.
// Restricted to ADMIN and CENTER_MANAGER.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, ["ADMIN", "CENTER_MANAGER"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const raw = String(b?.startDate ?? "").trim();
  const startDate = raw ? new Date(raw) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Valid start date is required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: { contract: true },
  });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!client.contract) {
    return NextResponse.json({ error: "Client has no contract to edit" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.client.update({ where: { id: params.id }, data: { startDate } }),
    prisma.contract.update({ where: { id: client.contract.id }, data: { startDate } }),
  ]);

  await logAction({
    userId: u.id,
    action: "CLIENT_START_DATE_EDIT",
    targetType: "Client",
    targetId: params.id,
    meta: { from: client.startDate, to: startDate },
  });

  return NextResponse.json({ ok: true });
}
