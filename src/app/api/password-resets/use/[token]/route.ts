import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// PUBLIC — user uses one-time approved token to set a new password.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { password } = await req.json();
  if (!password || password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  const r = await prisma.passwordResetRequest.findUnique({ where: { token: params.token }, include: { user: true } });
  if (!r) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (r.status !== "APPROVED") return NextResponse.json({ error: `Token ${r.status.toLowerCase()}` }, { status: 400 });
  if (r.expiresAt && r.expiresAt < new Date()) {
    await prisma.passwordResetRequest.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "Token expired" }, { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: r.userId }, data: { passwordHash } });
  await prisma.passwordResetRequest.update({ where: { id: r.id }, data: { status: "USED", token: null } });
  return NextResponse.json({ ok: true });
}
