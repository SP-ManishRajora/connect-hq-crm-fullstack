import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { getManagementStats } from "@/lib/housekeeping/dashboard";
import { raiseAlert, appUrl, ALERT_TYPES } from "@/lib/housekeeping/alerts";

export const runtime = "nodejs";

// POST /api/housekeeping/cron/daily-summary?period=daily|weekly
//
// Emails the management summary the brief §8 asks for. `period=weekly` widens
// the window and changes the dedupe key so both can run from the same route.
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
  const { ok } = await authorise(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekly = searchParams.get("period") === "weekly";
  const windowDays = weekly ? 7 : 1;
  const since = new Date(Date.now() - windowDays * 86400_000);

  const centres = await prisma.center.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  let sent = 0;
  for (const c of centres) {
    const stats = await getManagementStats(c.id);
    const cs = stats.centres[0];
    if (!cs) continue;

    const [raised, closed, discrepancies] = await Promise.all([
      prisma.hkIssue.count({ where: { centerId: c.id, createdAt: { gte: since } } }),
      prisma.hkIssue.count({ where: { centerId: c.id, closedAt: { gte: since } } }),
      prisma.generatorDiscrepancy.count({ where: { centerId: c.id, detectedAt: { gte: since } } }),
    ]);

    // Nothing at all happened and nothing is outstanding — don't send noise.
    if (raised === 0 && closed === 0 && discrepancies === 0 && cs.openIssues === 0) continue;

    const label = weekly ? "Weekly" : "Daily";
    const body = [
      `${label} housekeeping summary — ${c.name}`,
      ``,
      `Inspections today:        ${cs.inspectedToday} (${cs.compliancePct}% of expected)`,
      `Areas configured:         ${cs.areas}`,
      ``,
      `Issues raised (${windowDays}d):     ${raised}`,
      `Issues closed (${windowDays}d):     ${closed}`,
      `Still open:               ${cs.openIssues}`,
      `  of which critical:      ${cs.criticalIssues}`,
      `  of which overdue:       ${cs.overdueIssues}`,
      ``,
      `Generator discrepancies:  ${discrepancies} new, ${cs.genDiscrepancies} open`,
      `Generators running now:   ${cs.generatorsRunning}`,
      stats.avgResolutionHours != null
        ? `Avg resolution time:      ${stats.avgResolutionHours} h`
        : `Avg resolution time:      —`,
      ``,
      stats.topStaff.length
        ? `Top performers:\n${stats.topStaff.slice(0, 3).map((s, i) => `  ${i + 1}. ${s.name} — ${s.score} (${s.closed} closed)`).join("\n")}`
        : "",
      ``,
      `Dashboard: ${appUrl("/housekeeping")}`,
    ].filter(Boolean).join("\n");

    const res = await raiseAlert({
      centerId: c.id,
      alertType: ALERT_TYPES.DAILY_SUMMARY,
      severity: cs.criticalIssues > 0 ? "HIGH" : "LOW",
      title: `${label} summary — ${c.name}`,
      body,
      dedupeKey: `summary:${weekly ? "w" : "d"}:${c.id}:${new Date().toISOString().slice(0, 10)}`,
      meta: { raised, closed, openIssues: cs.openIssues, compliancePct: cs.compliancePct },
    });
    if (res.emailStatus === "SENT") sent++;
  }

  return NextResponse.json({ period: weekly ? "weekly" : "daily", centres: centres.length, sent });
}
