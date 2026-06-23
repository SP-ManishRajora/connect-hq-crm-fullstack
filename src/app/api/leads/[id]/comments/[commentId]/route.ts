import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// Edit a comment's body. The previous body is snapshotted into CommentEdit so the
// full history is preserved — nothing is ever lost, only appended to the log.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json();
  const body = String(b.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });

  const existing = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { id: true, leadId: true, body: true },
  });
  if (!existing || existing.leadId !== params.id) {
    return NextResponse.json({ error: "comment not found" }, { status: 404 });
  }
  if (existing.body === body) {
    // No change — return the comment as-is without writing a history row.
    return NextResponse.json(await readComment(params.commentId));
  }

  await prisma.$transaction([
    prisma.commentEdit.create({
      data: { commentId: existing.id, prevBody: existing.body, editorId: u.id },
    }),
    prisma.comment.update({
      where: { id: existing.id },
      data: { body, editedAt: new Date(), editedById: u.id },
    }),
  ]);

  return NextResponse.json(await readComment(params.commentId));
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: { id: true, leadId: true },
  });
  if (!existing || existing.leadId !== params.id) {
    return NextResponse.json({ error: "comment not found" }, { status: 404 });
  }
  await prisma.comment.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

function readComment(id: string) {
  return prisma.comment.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      edits: {
        orderBy: { createdAt: "desc" },
        include: { editor: { select: { name: true } } },
      },
    },
  });
}
