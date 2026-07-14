import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { findValidReset, markUsed, passwordError } from "@/lib/client-auth";
import { logAction } from "@/lib/audit";

// GET /api/auth/reset-password?token=... — validate a reset token (public).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const inv = await findValidReset(token);
  if (!inv) return NextResponse.json({ valid: false }, { status: 400 });
  return NextResponse.json({ valid: true, email: inv.email });
}

// POST /api/auth/reset-password — consume the token and set a new password (public).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || "");
  const password = String(b.password || "");

  const inv = await findValidReset(token);
  if (!inv || !inv.userId) {
    return NextResponse.json({ error: "This reset link is invalid or has expired" }, { status: 400 });
  }
  const pwErr = passwordError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: inv.userId }, data: { passwordHash } });
  await markUsed(token);
  await logAction({ userId: inv.userId, action: "PASSWORD_RESET", targetType: "User", targetId: inv.userId });

  return NextResponse.json({ ok: true });
}
