import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { isValidEmail } from "@/lib/validators";
import { createInvite, loginCapFor } from "@/lib/client-auth";
import { logAction } from "@/lib/audit";

const INVITE_ROLES = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"] as const;

// GET /api/clients/[id]/invites — list pending (unused, unexpired) portal invites.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(me.role, [...INVITE_ROLES])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const invites = await prisma.clientInvite.findMany({
    where: {
      employerClientId: params.id,
      type: "INVITE",
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true, expiresAt: true },
  });
  return NextResponse.json(invites);
}

// POST /api/clients/[id]/invites — staff generates a portal invite for a client contact.
// Enforces the login cap (max CLIENT logins per client = occupiedSeats).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(me.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // CENTER_MANAGER may only invite for clients in their own center.
  if (me.role === "CENTER_MANAGER" && me.centerId && client.centerId !== me.centerId) {
    return NextResponse.json({ error: "forbidden for this center" }, { status: 403 });
  }

  // Reject if the email already has an account.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return NextResponse.json({ error: "A user with that email already exists" }, { status: 400 });

  // Enforce login cap.
  const { cap, remaining } = await loginCapFor(params.id);
  if (remaining <= 0) {
    return NextResponse.json(
      { error: `Login limit reached (${cap} allowed). Free up a seat/login before inviting more.` },
      { status: 409 },
    );
  }

  const { link, expiresAt } = await createInvite({
    email,
    employerClientId: params.id,
    invitedById: me.id,
    companyName: client.companyName,
  });

  await logAction({ userId: me.id, action: "CLIENT_INVITE_SENT", targetType: "Client", targetId: params.id, meta: { email } });

  // Return the link too so staff can copy it if SMTP is not configured.
  return NextResponse.json({ ok: true, link, expiresAt });
}
