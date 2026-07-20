import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { sendMail } from "@/lib/mail";
import crypto from "crypto";

// Admin/Owner invites a user. Sends invite email. Status PENDING until acceptance.
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const b = await req.json();
  if (!b.email || !b.name || !b.role) return NextResponse.json({ error: "name, email, role required" }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { email: b.email } });
  if (exists) return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
  const pending = await prisma.userInvite.findFirst({ where: { email: b.email, status: "PENDING" } });
  if (pending) return NextResponse.json({ error: "Pending invite already exists for this email" }, { status: 400 });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const invite = await prisma.userInvite.create({
    data: {
      token, email: b.email, name: b.name, role: b.role,
      centerId: b.centerId || null,
      allowedModules: b.allowedModules ? JSON.stringify(b.allowedModules) : null,
      invitedById: me.id, expiresAt,
    },
  });
  const url = `${process.env.APP_URL || "http://localhost:3000"}/invite/${token}`;
  await sendMail(
    b.email,
    `You're invited to Coworking ERP — ${b.role}`,
    `Hi ${b.name},\n\n${me.name} has invited you to join Coworking ERP as ${b.role}.\nClick to set your password and complete sign up:\n${url}\n\nLink expires in 7 days.`
  );
  return NextResponse.json({ id: invite.id, link: url });
}

export async function GET() {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const list = await prisma.userInvite.findMany({ orderBy: { createdAt: "desc" }, include: { invitedBy: true } });
  return NextResponse.json(list);
}
