import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { raiseAlert, ALERT_TYPES } from "@/lib/housekeeping/alerts";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

// POST /api/housekeeping/cron/escalations
//
// Finds overdue, still-open issues and escalates them once. `escalatedAt` acts as
// the idempotency guard — re-running the job does not re-alert on the same issue
// (reassignment and rework reset it, which is the intended re-arm).
//
// Auth: either an `x-cron-secret` header matching HK_CRON_SECRET (for crontab —
// no session available), or an authenticated admin/manager triggering it manually.
async function authorise(req: NextRequest): Promise<{ ok: boolean; actor: string | null }> {
  const secret = process.env.HK_CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (secret && provided && provided === secret) return { ok: true, actor: null };

  const u = await getSessionUser();
  if (u && requireRole(u.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"])) {
    return { ok: true, actor: u.id };
  }
  return { ok: false, actor: null };
}

export async function POST(req: NextRequest) {
  const { ok, actor } = await authorise(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();

  const overdue = await prisma.hkIssue.findMany({
    where: {
      dueAt: { lt: now },
      escalatedAt: null,
      status: { notIn: ["CLOSED", "CANCELLED"] },
    },
    include: {
      center: { select: { id: true, name: true } },
      location: { select: { name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    take: 200,
  });

  if (overdue.length === 0) {
    return NextResponse.json({ escalated: 0, notified: 0 });
  }

  // Recipients: the module-level escalation list, falling back to active
  // admins/owners so an escalation is never silently swallowed.
  const to = (process.env.HK_ESCALATION_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (to.length === 0) {
    const admins = await prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "OWNER"] } },
      select: { email: true },
      take: 10,
    });
    to.push(...admins.map((a) => a.email));
  }

  const byCenter = new Map<string, typeof overdue>();
  for (const i of overdue) {
    const list = byCenter.get(i.center.name) ?? [];
    list.push(i);
    byCenter.set(i.center.name, list);
  }

  let notified = 0;
  const appUrl = process.env.APP_URL || "";

  for (const [centerName, issues] of byCenter) {
    const lines = issues.map((i) => {
      const hoursLate = Math.floor((now.getTime() - i.dueAt!.getTime()) / 3600_000);
      return `• [${i.severity}] ${i.title}${i.location ? ` — ${i.location.name}` : ""}\n` +
        `  Assigned to: ${i.assignee?.name ?? "UNASSIGNED"} · ${hoursLate}h overdue\n` +
        `  ${appUrl}/housekeeping/issues?id=${i.id}`;
    });

    const body =
      `${issues.length} housekeeping issue(s) at ${centerName} are past their due time.\n\n` +
      lines.join("\n\n") +
      `\n\nThis is an automated escalation from the housekeeping module.`;

    // Routed through the Phase 8 alert engine so delivery is logged in
    // NotificationLog and the escalation is visible in-app, not only by email.
    const res = await raiseAlert({
      centerId: issues[0].centerId,
      alertType: ALERT_TYPES.ISSUE_OVERDUE,
      severity: "HIGH",
      title: `${issues.length} overdue housekeeping issue(s) — ${centerName}`,
      body,
      subjectType: "HkIssue",
      subjectId: issues[0].id,
      dedupeKey: `overdue:${issues[0].centerId}:${now.toISOString().slice(0, 13)}`,
      meta: { count: issues.length, issueIds: issues.map((i) => i.id).slice(0, 50) },
    });
    if (res.emailStatus === "SENT") notified++;
  }

  await prisma.hkIssue.updateMany({
    where: { id: { in: overdue.map((i) => i.id) } },
    data: { escalatedAt: now },
  });

  await logAction({
    userId: actor,
    action: "HK_ISSUES_ESCALATED",
    targetType: "HkIssue",
    meta: {
      count: overdue.length,
      centres: Array.from(byCenter.keys()),
      recipients: to.length,
      issueIds: overdue.map((i) => i.id).slice(0, 50),
    },
  });

  return NextResponse.json({
    escalated: overdue.length,
    notified,
    centres: Array.from(byCenter.keys()),
  });
}
