import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// Public: verify invite token (GET) and accept it by setting password (POST).
export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const inv = await prisma.userInvite.findUnique({ where: { token: params.token } });
  if (!inv) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (inv.status !== "PENDING") return NextResponse.json({ error: `Invite ${inv.status.toLowerCase()}` }, { status: 400 });
  if (inv.expiresAt < new Date()) {
    await prisma.userInvite.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }
  return NextResponse.json({ email: inv.email, name: inv.name, role: inv.role });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { password, phone, aadhaar, pan, designation } = await req.json();
  if (!password || password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  const inv = await prisma.userInvite.findUnique({ where: { token: params.token } });
  if (!inv) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (inv.status !== "PENDING") return NextResponse.json({ error: `Invite ${inv.status.toLowerCase()}` }, { status: 400 });
  if (inv.expiresAt < new Date()) {
    await prisma.userInvite.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { email: inv.email } });
  if (exists) return NextResponse.json({ error: "User already exists" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: inv.email, name: inv.name, role: inv.role, centerId: inv.centerId,
      allowedModules: inv.allowedModules, passwordHash,
      phone: phone || null, aadhaar: aadhaar || null, pan: pan || null, designation: designation || null,
    },
  });
  await prisma.userInvite.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), createdUserId: user.id } });
  return NextResponse.json({ ok: true });
}
