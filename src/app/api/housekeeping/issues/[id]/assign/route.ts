import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { assignIssueSchema } from "@/lib/housekeeping/validators";
import { assertTransition, computeDueAt, type IssueStatus, type Severity } from "@/lib/housekeeping/issues";

// POST /api/housekeeping/issues/[id]/assign
// Assigning (or reassigning) an issue. Passing assigneeId: null unassigns it
// back to OPEN.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(assignIssueSchema, await req.json());
    const issue = await prisma.hkIssue.findUnique({ where: { id: params.id } });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    const next: IssueStatus = body.assigneeId ? "ASSIGNED" : "OPEN";
    assertTransition(issue.status as IssueStatus, next);

    if (body.assigneeId) {
      const target = await prisma.user.findFirst({
        where: { id: body.assigneeId, active: true },
        select: { id: true, name: true, centerId: true, role: true },
      });
      if (!target) throw Object.assign(new Error("Assignee not found"), { __status: 404 });
    }

    // Re-triaging severity resets the clock — a downgraded issue shouldn't stay
    // due in 2 hours, and an upgraded one shouldn't keep a lax deadline.
    const severity = (body.severity ?? issue.severity) as Severity;
    const dueAt =
      body.severity && body.severity !== issue.severity
        ? await computeDueAt(severity)
        : issue.dueAt;

    const row = await prisma.hkIssue.update({
      where: { id: issue.id },
      data: {
        assigneeId: body.assigneeId,
        status: next,
        severity,
        dueAt,
        escalatedAt: null, // re-arm escalation after a reassignment
      },
      include: {
        assignee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    await logAction({
      userId: u.id,
      action: body.assigneeId ? "HK_ISSUE_ASSIGNED" : "HK_ISSUE_UNASSIGNED",
      targetType: "HkIssue",
      targetId: row.id,
      meta: {
        before: { assigneeId: issue.assigneeId, severity: issue.severity, status: issue.status },
        after: { assigneeId: row.assigneeId, severity: row.severity, status: row.status },
        dueAt: row.dueAt,
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}
