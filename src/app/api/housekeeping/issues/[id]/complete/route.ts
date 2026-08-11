import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModuleOrAssignee, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { completeActionSchema } from "@/lib/housekeeping/validators";
import { assertTransition, type IssueStatus } from "@/lib/housekeeping/issues";
import { getIssueConfig } from "@/lib/housekeeping/settings";

// POST /api/housekeeping/issues/[id]/complete
// Assignee submits the work. An "after" photograph is required by default
// (admin-configurable) — the brief makes after-evidence the core of the
// corrective-action loop.
//
// `unableReason` is the escape hatch: work that genuinely cannot be done returns
// the issue to ASSIGNED with the reason recorded, rather than being force-closed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // The assignee may act on their own task even without the module.
  const u = await requireModuleOrAssignee("hk_issues", params.id);
  if (isResponse(u)) return u;

  try {
    const body = parseBody(completeActionSchema, await req.json().catch(() => ({})));

    const issue = await prisma.hkIssue.findUnique({
      where: { id: params.id },
      include: { actions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    const isAssignee = issue.assigneeId === u.id;
    const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);
    if (!isAssignee && !isManager) {
      throw Object.assign(new Error("Only the assignee can submit this work"), { __status: 403 });
    }

    const action = issue.actions[0];
    if (!action) {
      throw Object.assign(
        new Error("Mark the work as started before submitting it"),
        { __status: 409 },
      );
    }

    // --- Unable to complete: back to ASSIGNED, reason recorded --------------
    if (body.unableReason) {
      assertTransition(issue.status as IssueStatus, "ASSIGNED");
      const [row] = await prisma.$transaction([
        prisma.hkIssue.update({ where: { id: issue.id }, data: { status: "ASSIGNED" } }),
        prisma.correctiveAction.update({
          where: { id: action.id },
          data: { unableReason: body.unableReason, notes: body.notes ?? null },
        }),
      ]);

      await logAction({
        userId: u.id,
        action: "HK_ISSUE_UNABLE_TO_COMPLETE",
        targetType: "HkIssue",
        targetId: row.id,
        meta: { actionId: action.id, reason: body.unableReason },
      });

      return NextResponse.json({ ...row, unable: true });
    }

    // --- Normal completion --------------------------------------------------
    const cfg = await getIssueConfig();
    if (cfg.requireAfterPhoto && !body.afterPhotoId) {
      throw Object.assign(
        new Error("An 'after' photograph is required before submitting this work"),
        { __status: 400 },
      );
    }

    if (body.afterPhotoId) {
      const photo = await prisma.inspectionPhoto.findUnique({
        where: { id: body.afterPhotoId },
        select: { id: true },
      });
      if (!photo) throw Object.assign(new Error("After photograph not found"), { __status: 404 });
    }

    assertTransition(issue.status as IssueStatus, "AWAITING_VERIFICATION");

    const [row] = await prisma.$transaction([
      prisma.hkIssue.update({
        where: { id: issue.id },
        data: { status: "AWAITING_VERIFICATION" },
      }),
      prisma.correctiveAction.update({
        where: { id: action.id },
        data: {
          completedAt: new Date(),
          afterPhotoId: body.afterPhotoId ?? null,
          notes: body.notes ?? null,
        },
      }),
    ]);

    await logAction({
      userId: u.id,
      action: "HK_ISSUE_WORK_SUBMITTED",
      targetType: "HkIssue",
      targetId: row.id,
      meta: {
        actionId: action.id,
        afterPhotoId: body.afterPhotoId ?? null,
        minutesTaken: action.startedAt
          ? Math.round((Date.now() - action.startedAt.getTime()) / 60000)
          : null,
        withinSla: issue.dueAt ? Date.now() <= issue.dueAt.getTime() : null,
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}
