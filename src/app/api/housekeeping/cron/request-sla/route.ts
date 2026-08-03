import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { raiseAlert, appUrl, ALERT_TYPES } from "@/lib/housekeeping/alerts";
import { markComplaint, transition } from "@/lib/housekeeping/requests";
import { getRequestConfig } from "@/lib/housekeeping/settings";

export const runtime = "nodejs";

// POST /api/housekeeping/cron/request-sla
//
// Handles the time-based conditions from brief §32 that no user action triggers:
//   • SLA target passed without completion  → flag + alert + convert to complaint
//   • completed and awaiting confirmation past the window → auto-close
async function authorise(req: NextRequest): Promise<boolean> {
  const secret = process.env.HK_CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const u = await getSessionUser();
  return Boolean(u && requireRole(u.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"]));
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = await getRequestConfig();
  const now = new Date();

  // --- 1. SLA breaches ------------------------------------------------------
  const overdue = await prisma.cleaningRequest.findMany({
    where: {
      dueAt: { lt: now },
      slaBreached: false,
      status: { notIn: ["COMPLETED", "AWAITING_CONFIRMATION", "CLOSED", "CANCELLED"] },
    },
    include: {
      center: { select: { name: true } },
      location: { select: { name: true } },
      assignee: { select: { name: true } },
    },
    take: 200,
  });

  let breached = 0;
  for (const r of overdue) {
    await prisma.cleaningRequest.update({
      where: { id: r.id }, data: { slaBreached: true },
    });
    // Brief §33 — an SLA breach converts the request into a complaint.
    await markComplaint(r.id, "Service-level target was breached");
    breached++;

    const lateMin = Math.round((now.getTime() - r.dueAt!.getTime()) / 60_000);
    await raiseAlert({
      centerId: r.centerId,
      alertType: ALERT_TYPES.ISSUE_OVERDUE,
      severity: r.priority === "URGENT" ? "CRITICAL" : "HIGH",
      title: `SLA breached — ${r.ticketNo} (${r.location?.name ?? r.center.name})`,
      body:
        `A client cleaning request has passed its service-level target.\n\n` +
        `Ticket:    ${r.ticketNo}\nCentre:    ${r.center.name}\n` +
        `Area:      ${r.location?.name ?? "—"}\nType:      ${r.typeNameSnapshot}\n` +
        `Priority:  ${r.priority}\nAssignee:  ${r.assignee?.name ?? "UNASSIGNED"}\n` +
        `Status:    ${r.status}\nOverdue:   ${lateMin} minutes\n\n` +
        `${appUrl(`/housekeeping/requests?id=${r.id}`)}`,
      subjectType: "CleaningRequest",
      subjectId: r.id,
      dedupeKey: `cr:${r.id}:sla`,
      meta: { ticketNo: r.ticketNo, lateMinutes: lateMin, priority: r.priority },
    });
  }

  // --- 2. auto-close unconfirmed completions -------------------------------
  let autoClosed = 0;
  if (cfg.autoCloseAfterHours > 0) {
    const cutoff = new Date(now.getTime() - cfg.autoCloseAfterHours * 3600_000);
    const stale = await prisma.cleaningRequest.findMany({
      where: {
        status: { in: ["COMPLETED", "AWAITING_CONFIRMATION"] },
        completedAt: { lt: cutoff },
        confirmation: null,
      },
      select: { id: true },
      take: 200,
    });
    for (const s of stale) {
      await transition(s.id, "CLOSED", {
        note: `Auto-closed after ${cfg.autoCloseAfterHours}h with no client response`,
        extra: { closedAt: now },
      });
      autoClosed++;
    }
  }

  return NextResponse.json({ breached, autoClosed });
}
