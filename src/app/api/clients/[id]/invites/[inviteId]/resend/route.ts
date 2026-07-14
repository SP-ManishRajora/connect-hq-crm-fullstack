import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { reissueInvite } from "@/lib/client-auth";
import { logAction } from "@/lib/audit";

// POST /api/clients/[id]/invites/[inviteId]/resend — issue a fresh token for an
// existing pending invite and re-email it. Reuses the row so it doesn't count as
// an extra pending invite against the login cap.
export async function POST(_req: NextRequest, { params }: { params: { id: string; inviteId: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(me.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (me.role === "CENTER_MANAGER" && me.centerId && client.centerId !== me.centerId) {
    return NextResponse.json({ error: "forbidden for this center" }, { status: 403 });
  }

  // Confirm the invite belongs to this client before reissuing.
  const existing = await prisma.clientInvite.findUnique({ where: { id: params.inviteId } });
  if (!existing || existing.employerClientId !== params.id || existing.type !== "INVITE" || existing.usedAt) {
    return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });
  }

  const result = await reissueInvite(params.inviteId, client.companyName);
  if (!result) return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });

  await logAction({ userId: me.id, action: "CLIENT_INVITE_RESENT", targetType: "Client", targetId: params.id, meta: { email: result.email } });
  return NextResponse.json({ ok: true, link: result.link, expiresAt: result.expiresAt });
}
