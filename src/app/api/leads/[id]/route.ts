import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canTransition } from "@/lib/leadStatus";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();

  // Status changes are gated: only a valid one-step transition, and a comment is required.
  if (typeof b.status === "string") {
    const existing = await prisma.lead.findUnique({ where: { id: params.id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "lead not found" }, { status: 404 });

    if (b.status !== existing.status) {
      if (!canTransition(existing.status, b.status)) {
        return NextResponse.json(
          { error: `Cannot move from "${existing.status}" to "${b.status}". Status advances one step at a time.` },
          { status: 400 },
        );
      }
      const comment = String(b.comment || "").trim();
      if (!comment) {
        return NextResponse.json({ error: "A comment is required to change status." }, { status: 400 });
      }

      const [lead] = await prisma.$transaction([
        prisma.lead.update({ where: { id: params.id }, data: { status: b.status } }),
        prisma.comment.create({
          data: {
            leadId: params.id,
            body: `Status: ${existing.status} → ${b.status}. ${comment}`,
            channel: "STATUS",
            authorId: u.id,
          },
        }),
      ]);
      return NextResponse.json(lead);
    }
  }

  // Non-status updates: strip control fields and update directly.
  const { comment: _c, status: _s, ...rest } = b;
  const lead = await prisma.lead.update({ where: { id: params.id }, data: rest });
  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.lead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
