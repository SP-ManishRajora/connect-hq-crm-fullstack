import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { assignIssueSchema } from "@/lib/housekeeping/validators";
import { assertTransition, computeDueAt, type IssueStatus, type Severity } from "@/lib/housekeeping/issues";
import { sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/housekeeping/alerts";

// POST /api/housekeeping/issues/[id]/assign
// Assigning (or reassigning) an issue. Passing assigneeId: null unassigns it
// back to OPEN.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(assignIssueSchema, await req.json());
    let newAssignee: { id: string; name: string; email: string } | null = null;
    const issue = await prisma.hkIssue.findUnique({ where: { id: params.id } });
    if (!issue) throw Object.assign(new Error("Issue not found"), { __status: 404 });
    assertCenterAllowed(u, issue.centerId);

    const next: IssueStatus = body.assigneeId ? "ASSIGNED" : "OPEN";
    assertTransition(issue.status as IssueStatus, next);

    if (body.assigneeId) {
      const target = await prisma.user.findFirst({
        where: { id: body.assigneeId, active: true },
        select: { id: true, name: true, email: true, centerId: true, role: true },
      });
      if (!target) throw Object.assign(new Error("Assignee not found"), { __status: 404 });
      newAssignee = target;
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

    // Tell the new assignee. Someone who is handed work without being told
    // simply will not do it. Wrapped so a mail outage cannot undo the
    // reassignment, which is already committed above.
    if (newAssignee && newAssignee.id !== issue.assigneeId) {
      try {
        await notifyAssignee({
          issueId: row.id,
          centerId: issue.centerId,
          title: row.title,
          area: row.location?.name ?? null,
          severity: row.severity,
          dueAt: row.dueAt,
          assignee: newAssignee,
          assignedBy: u.name,
          // A handover mid-job is worth spelling out.
          takenOver: issue.status === "IN_PROGRESS" || issue.status === "REJECTED",
          previousStatus: issue.status,
        });
      } catch (e) {
        console.error("assignment notification failed (assignment stands):", e);
      }
    }

    await logAction({
      userId: u.id,
      action: body.assigneeId ? "HK_ISSUE_ASSIGNED" : "HK_ISSUE_UNASSIGNED",
      targetType: "HkIssue",
      targetId: row.id,
      meta: {
        before: { assigneeId: issue.assigneeId, severity: issue.severity, status: issue.status },
        after: { assigneeId: row.assigneeId, severity: row.severity, status: row.status },
        dueAt: row.dueAt,
        reassigned: Boolean(issue.assigneeId && body.assigneeId && issue.assigneeId !== body.assigneeId),
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}

/** In-app alert plus an email so the new assignee actually knows. */
async function notifyAssignee(p: {
  issueId: string;
  centerId: string;
  title: string;
  area: string | null;
  severity: string;
  dueAt: Date | null;
  assignee: { id: string; name: string; email: string };
  assignedBy: string;
  takenOver: boolean;
  previousStatus: string;
}) {
  const due = p.dueAt
    ? p.dueAt.toISOString().slice(0, 16).replace("T", " ")
    : "no deadline set";

  const body =
    `${p.assignedBy} has assigned this to you.\n\n` +
    `Task:     ${p.title}\n` +
    `Area:     ${p.area ?? "—"}\n` +
    `Priority: ${p.severity}\n` +
    `Due by:   ${due}\n` +
    (p.takenOver
      ? p.previousStatus === "REJECTED"
        ? `\nThis job was sent back for rework — please check what was wrong before starting.\n`
        : `\nThis job was already in progress with someone else and has been handed to you.\n`
      : "") +
    `\nOpen your tasks: ${appUrl("/housekeeping/tasks")}`;

  await prisma.hkAlert.create({
    data: {
      centerId: p.centerId,
      alertType: "CRITICAL_ISSUE",
      severity: p.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
      title: `Assigned to you: ${p.title}`,
      body,
      subjectType: "HkIssue",
      subjectId: p.issueId,
      targetUserId: p.assignee.id,
      // One alert per person per issue; a later handover to someone else makes
      // its own key, so nobody is silently skipped.
      dedupeKey: `issue:${p.issueId}:assigned:${p.assignee.id}`,
      meta: JSON.stringify({ area: p.area, severity: p.severity, assignedBy: p.assignedBy }),
    },
  });

  if (p.assignee.email) {
    await sendMail(p.assignee.email, `[Housekeeping] Assigned to you: ${p.title}`, body);
  }
}
