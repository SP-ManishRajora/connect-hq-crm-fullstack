import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { promotedSource } from "@/lib/oldLeads";

// Webhook-friendly: requires either session OR a header X-Webhook-Secret matching JWT_SECRET
// (Use this for WhatsApp gateway → POST comments to a specific lead)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  const webhook = req.headers.get("x-webhook-secret");
  if (!u && webhook !== process.env.JWT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const b = await req.json();
  const c = await prisma.comment.create({
    data: {
      leadId: params.id,
      body: b.body,
      channel: b.channel || "INTERNAL",
      authorId: u?.id,
    },
  });
  // A follow-up note from staff moves an imported lead out of the Old Data tab.
  // Webhook messages (WhatsApp gateway) do not: nobody has followed up yet.
  if (u) {
    const lead = await prisma.lead.findUnique({ where: { id: params.id }, select: { source: true } });
    const promoted = promotedSource(lead?.source);
    if (promoted) await prisma.lead.update({ where: { id: params.id }, data: { source: promoted } });
  }
  return NextResponse.json(c);
}
