import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { sendMail } from "@/lib/mail";
import crypto from "crypto";

// POST { decision: "APPROVE" | "REJECT", remarks?: string }
// On APPROVE: generates one-time token (24h), emails user a /reset/<token> link.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const { decision, remarks } = await req.json();
  const r = await prisma.passwordResetRequest.findUnique({ where: { id: params.id }, include: { user: true } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (r.status !== "PENDING") return NextResponse.json({ error: "Already actioned" }, { status: 400 });

  if (decision === "REJECT") {
    await prisma.passwordResetRequest.update({
      where: { id: r.id },
      data: { status: "REJECTED", decidedById: me.id, decidedAt: new Date(), remarks: remarks || null },
    });
    await sendMail(r.user.email, "Password reset request rejected", `Your password reset request was rejected.\nRemarks: ${remarks || "(none)"}`);
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await prisma.passwordResetRequest.update({
    where: { id: r.id },
    data: { status: "APPROVED", decidedById: me.id, decidedAt: new Date(), remarks: remarks || null, token, expiresAt },
  });
  const url = `${process.env.APP_URL || "http://localhost:3000"}/reset/${token}`;
  await sendMail(r.user.email, "Password reset approved",
    `Hi ${r.user.name},\n\nYour password reset has been approved by ${me.name}. Click below to set a new password (link valid 24h):\n\n${url}\n\nIf you didn't request this, contact admin.`);
  return NextResponse.json({ ok: true, link: url });
}
