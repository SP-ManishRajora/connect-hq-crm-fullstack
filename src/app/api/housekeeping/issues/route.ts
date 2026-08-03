import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
  centerScope,
  assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { createIssueSchema } from "@/lib/housekeeping/validators";
import { createIssue, isCriticalByNature } from "@/lib/housekeeping/issues";
import { raiseAlert, buildAlertBody, appUrl, ALERT_TYPES } from "@/lib/housekeeping/alerts";
import { getIssueConfig } from "@/lib/housekeeping/settings";
import { photoUrl } from "@/lib/housekeeping/storage";

// GET /api/housekeeping/issues?status=&severity=&centerId=&mine=1&overdue=1
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const severity = searchParams.get("severity") || undefined;
    const centerId = searchParams.get("centerId") || undefined;
    const mine = searchParams.get("mine") === "1";
    const overdue = searchParams.get("overdue") === "1";
    const open = searchParams.get("open") === "1";

    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.hkIssue.findMany({
      where: {
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
        ...(status ? { status: status as any } : {}),
        ...(severity ? { severity: severity as any } : {}),
        ...(mine ? { assigneeId: u.id } : {}),
        ...(open ? { status: { notIn: ["CLOSED", "CANCELLED"] } } : {}),
        ...(overdue
          ? { dueAt: { lt: new Date() }, status: { notIn: ["CLOSED", "CANCELLED"] } }
          : {}),
      },
      orderBy: [{ severity: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        center: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        raisedBy: { select: { id: true, name: true } },
        actions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { assignee: { select: { id: true, name: true } } },
        },
        _count: { select: { reinspections: true } },
      },
    });

    // Attach signed URLs rather than raw file paths — server paths never reach a client.
    const withUrls = rows.map((r) => ({
      ...r,
      beforePhotoUrl: r.beforePhotoId ? photoUrl(r.beforePhotoId) : null,
      afterPhotoUrl: r.actions[0]?.afterPhotoId ? photoUrl(r.actions[0].afterPhotoId) : null,
    }));

    return NextResponse.json(withUrls);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/housekeeping/issues — raise an issue (manual or from an inspection).
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_issues");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(createIssueSchema, await req.json());
    assertCenterAllowed(u, body.centerId);

    // Fall back to the centre's default assignee when none is chosen.
    const cfg = await getIssueConfig();
    const assigneeId = body.assigneeId ?? cfg.defaultAssigneeByCenter[body.centerId] ?? null;

    const issue = await createIssue({
      centerId: body.centerId,
      locationId: body.locationId ?? null,
      visitId: body.visitId ?? null,
      source: body.source,
      category: body.category,
      title: body.title,
      description: body.description ?? null,
      severity: body.severity,
      beforePhotoId: body.beforePhotoId ?? null,
      assigneeId,
      raisedById: u.id,
    });

    const escalated = isCriticalByNature(body.title, body.description);

    // Phase 8 — a CRITICAL issue interrupts immediately rather than waiting for
    // the overdue-escalation cron.
    if (issue.severity === "CRITICAL") {
      const centre = await prisma.center.findUnique({
        where: { id: issue.centerId }, select: { name: true },
      });
      await raiseAlert({
        centerId: issue.centerId,
        alertType: ALERT_TYPES.CRITICAL_ISSUE,
        severity: "CRITICAL",
        title: issue.title,
        body: buildAlertBody({
          centre: centre?.name ?? issue.centerId,
          area: issue.location?.name ?? null,
          user: issue.raisedBy.name,
          alertType: escalated ? "CRITICAL_ISSUE (auto-escalated hazard)" : "CRITICAL_ISSUE",
          severity: "CRITICAL",
          findings: issue.description ?? null,
          action: issue.dueAt
            ? `Assign and rectify by ${issue.dueAt.toISOString().slice(0, 16).replace("T", " ")}.`
            : "Assign and rectify immediately.",
          link: appUrl(`/housekeeping/issues?id=${issue.id}`),
        }),
        subjectType: "HkIssue",
        subjectId: issue.id,
        dedupeKey: `issue:${issue.id}:raised`,
        meta: { category: issue.category, autoEscalated: escalated },
      });
    }

    await logAction({
      userId: u.id,
      action: escalated ? "HK_ISSUE_RAISED_CRITICAL" : "HK_ISSUE_RAISED",
      targetType: "HkIssue",
      targetId: issue.id,
      meta: {
        centerId: issue.centerId,
        locationName: issue.location?.name ?? null,
        category: issue.category,
        severityReported: body.severity,
        severityApplied: issue.severity,
        autoEscalated: escalated,
        dueAt: issue.dueAt,
        assigneeId,
      },
    });

    return NextResponse.json(
      {
        ...issue,
        autoEscalated: escalated,
        beforePhotoUrl: issue.beforePhotoId ? photoUrl(issue.beforePhotoId) : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
