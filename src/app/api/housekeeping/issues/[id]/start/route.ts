import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { assertTransition, type IssueStatus } from "@/lib/housekeeping/issues";

// POST /api/housekeeping/issues/[id]/start — assignee marks work as started.
// Opens a CorrectiveAction row: one per attempt, so a rejected attempt keeps its
// own record instead of being overwritten by the retry.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const issue = await prisma.hkIssue.findUnique({ where: { id: params.id } });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    const isAssignee = issue.assigneeId === u.id;
    const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);
    if (!isAssignee && !isManager) {
      throw Object.assign(new Error("Only the assignee can start this work"), { __status: 403 });
    }

    assertTransition(issue.status as IssueStatus, "IN_PROGRESS");

    const [row, action] = await prisma.$transaction([
      prisma.hkIssue.update({
        where: { id: issue.id },
        data: { status: "IN_PROGRESS" },
      }),
      prisma.correctiveAction.create({
        data: {
          issueId: issue.id,
          assigneeId: issue.assigneeId ?? u.id,
          startedAt: new Date(),
        },
      }),
    ]);

    await logAction({
      userId: u.id,
      action: "HK_ISSUE_WORK_STARTED",
      targetType: "HkIssue",
      targetId: row.id,
      meta: { actionId: action.id, assigneeId: action.assigneeId },
    });

    return NextResponse.json({ ...row, action });
  } catch (e) {
    return handleError(e);
  }
}
