import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { revokeInvite } from "@/lib/client-auth";
import { logAction } from "@/lib/audit";

// DELETE /api/clients/[id]/invites/[inviteId] — revoke a pending invite. Marks it
// used so it stops counting against the login cap and its link can't be redeemed.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; inviteId: string } }) {
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

  const existing = await prisma.clientInvite.findUnique({ where: { id: params.inviteId } });
  if (!existing || existing.employerClientId !== params.id || existing.type !== "INVITE" || existing.usedAt) {
    return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });
  }

  const revoked = await revokeInvite(params.inviteId);
  if (!revoked) return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });

  await logAction({ userId: me.id, action: "CLIENT_INVITE_REVOKED", targetType: "Client", targetId: params.id, meta: { email: revoked.email } });
  return NextResponse.json({ ok: true });
}
