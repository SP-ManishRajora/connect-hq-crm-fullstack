import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { verifyIssueSchema } from "@/lib/housekeeping/validators";
import { assertTransition, assertCanVerify, type IssueStatus } from "@/lib/housekeeping/issues";

// POST /api/housekeeping/issues/[id]/verify
// PASS → CLOSED. FAIL → REJECTED (rework), with an immutable ReinspectionRecord
// written either way. The assignee cannot sign off their own work.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(verifyIssueSchema, await req.json());

    const issue = await prisma.hkIssue.findUnique({
      where: { id: params.id },
      include: { actions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    assertCanVerify(issue, u.id, u.role);

    const next: IssueStatus = body.verdict === "PASS" ? "CLOSED" : "REJECTED";
    assertTransition(issue.status as IssueStatus, next);

    const [row, record] = await prisma.$transaction([
      prisma.hkIssue.update({
        where: { id: issue.id },
        data: {
          status: next,
          ...(next === "CLOSED"
            ? { closedById: u.id, closedAt: new Date() }
            : { escalatedAt: null }), // rework re-arms escalation
        },
      }),
      prisma.reinspectionRecord.create({
        data: {
          issueId: issue.id,
          actionId: issue.actions[0]?.id ?? null,
          verifiedById: u.id,
          verdict: body.verdict,
          notes: body.notes ?? null,
        },
      }),
    ]);

    await logAction({
      userId: u.id,
      action: body.verdict === "PASS" ? "HK_ISSUE_CLOSED" : "HK_ISSUE_REJECTED",
      targetType: "HkIssue",
      targetId: row.id,
      meta: {
        verdict: body.verdict,
        reinspectionId: record.id,
        assigneeId: issue.assigneeId,
        notes: body.notes ?? null,
        closedWithinSla:
          body.verdict === "PASS" && issue.dueAt ? Date.now() <= issue.dueAt.getTime() : null,
      },
    });

    return NextResponse.json({ ...row, reinspection: record });
  } catch (e) {
    return handleError(e);
  }
}
