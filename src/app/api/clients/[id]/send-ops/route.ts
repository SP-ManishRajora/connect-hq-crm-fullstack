import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { logAction } from "@/lib/audit";

// POST /api/clients/[id]/send-ops
// Sends an email TO THE CLIENT (subject + body reviewed/edited in the compose popup)
// and marks the client as sentToOps. Still notifies internal ops/CM of the handover.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const subject = String(b?.subject || "").trim();
  const body = String(b?.body || "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: params.id }, include: { center: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "This client has no email address" }, { status: 400 });

  // Primary: email the client with the composed subject/body.
  const result = await sendMail(client.email, subject, body);

  // Mark handed-over.
  const c = await prisma.client.update({
    where: { id: params.id },
    data: { sentToOps: true },
    include: { center: true },
  });

  // Internal handover notice to OPS + this center's CMs (kept, in addition to the client email).
  const ops = await prisma.user.findMany({
    where: { OR: [{ role: "OPS" }, { role: "CENTER_MANAGER", centerId: c.centerId }] },
  });
  for (const o of ops) {
    await sendMail(o.email, `New onboarding handover: ${c.companyName}`, `New client onboarding for center ${c.center.name}.\nSpecial: ${c.specialAgreement || "—"}\nStart: ${c.startDate}`);
  }

  await logAction({ userId: u.id, action: "CLIENT_MAIL_SENT", targetType: "Client", targetId: c.id, meta: { to: client.email, subject } });

  return NextResponse.json({ ...c, mail: result });
}
