import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { findValidInvite, loginCapFor, markUsed, passwordError } from "@/lib/client-auth";
import { logAction } from "@/lib/audit";

// GET /api/auth/register?token=... — validate an invite (public). Returns the invited email.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const inv = await findValidInvite(token);
  if (!inv) return NextResponse.json({ valid: false }, { status: 400 });
  const client = inv.employerClientId
    ? await prisma.client.findUnique({ where: { id: inv.employerClientId }, select: { companyName: true } })
    : null;
  return NextResponse.json({ valid: true, email: inv.email, companyName: client?.companyName || null });
}

// POST /api/auth/register — consume an invite and create the CLIENT user (public).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || "");
  const name = String(b.name || "").trim();
  const password = String(b.password || "");

  const inv = await findValidInvite(token);
  if (!inv) return NextResponse.json({ error: "This invite link is invalid or has expired" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const pwErr = passwordError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  // Guard against a duplicate account created between invite issue and consumption.
  const existing = await prisma.user.findUnique({ where: { email: inv.email } });
  if (existing) {
    await markUsed(token);
    return NextResponse.json({ error: "An account with this email already exists. Please sign in." }, { status: 400 });
  }

  // Re-check the login cap at consume time (invites issued earlier may now exceed it).
  if (inv.employerClientId) {
    const { remaining, cap } = await loginCapFor(inv.employerClientId);
    // The pending invite we are consuming is counted in `used`, so remaining===0 here
    // means the cap is fully taken by OTHER invites/users; block to be safe.
    if (remaining <= 0 && cap > 0) {
      // Allow if the only thing filling the cap is this very invite: recompute excluding it.
      const activeUsers = await prisma.user.count({
        where: { employerClientId: inv.employerClientId, role: "CLIENT", deletedAt: null },
      });
      const otherPending = await prisma.clientInvite.count({
        where: {
          employerClientId: inv.employerClientId,
          type: "INVITE",
          usedAt: null,
          expiresAt: { gt: new Date() },
          NOT: { token },
        },
      });
      if (activeUsers + otherPending >= cap) {
        return NextResponse.json({ error: "Login limit reached for this account. Contact your manager." }, { status: 409 });
      }
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      email: inv.email,
      passwordHash,
      role: "CLIENT",
      employerClientId: inv.employerClientId,
    },
  });
  await markUsed(token);
  await logAction({ userId: user.id, action: "CLIENT_REGISTERED", targetType: "User", targetId: user.id, meta: { email: inv.email } });

  return NextResponse.json({ ok: true });
}
