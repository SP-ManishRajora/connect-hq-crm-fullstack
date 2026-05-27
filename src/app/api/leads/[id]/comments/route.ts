import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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
  return NextResponse.json(c);
}
