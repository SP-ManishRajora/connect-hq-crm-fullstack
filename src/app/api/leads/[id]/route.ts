import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";
import { canTransition } from "@/lib/leadStatus";

// Roles allowed to edit or delete a lead. Sales can manage leads; managers/admins retain full access.
const LEAD_WRITE_ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...LEAD_WRITE_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to edit leads" }, { status: 403 });
  }
  const b = await req.json();

  // Status changes are gated: the target must be a known status, and a comment is required.
  if (typeof b.status === "string") {
    const existing = await prisma.lead.findUnique({ where: { id: params.id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "lead not found" }, { status: 404 });

    if (b.status !== existing.status) {
      if (!canTransition(existing.status, b.status)) {
        return NextResponse.json(
          { error: `Cannot move from "${existing.status}" to "${b.status}". Unknown status.` },
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
      await logAction({
        userId: u.id,
        action: "LEAD_STATUS_UPDATED",
        targetType: "Lead",
        targetId: params.id,
        meta: { from: existing.status, to: b.status, comment },
      });
      return NextResponse.json(lead);
    }
  }

  // Non-status updates: strip control fields and update directly.
  const { comment: _c, status: _s, ...rest } = b;

  // Capture the full before-state of the fields being changed so the edit is auditable.
  const before = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  const lead = await prisma.lead.update({ where: { id: params.id }, data: rest });

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(rest)) {
    const beforeVal = (before as Record<string, unknown>)[key];
    const afterVal = (lead as Record<string, unknown>)[key];
    if (beforeVal !== afterVal) changed[key] = { from: beforeVal, to: afterVal };
  }
  await logAction({
    userId: u.id,
    action: "LEAD_UPDATED",
    targetType: "Lead",
    targetId: params.id,
    meta: { changed },
  });
  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...LEAD_WRITE_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to delete leads" }, { status: 403 });
  }

  // Snapshot the full lead before it is removed so the deletion stays fully auditable.
  const existing = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  await prisma.lead.delete({ where: { id: params.id } });
  await logAction({
    userId: u.id,
    action: "LEAD_DELETED",
    targetType: "Lead",
    targetId: params.id,
    meta: { snapshot: existing },
  });
  return NextResponse.json({ ok: true });
}
