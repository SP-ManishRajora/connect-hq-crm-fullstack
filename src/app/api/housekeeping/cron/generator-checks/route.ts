import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { openRun, recordFindings } from "@/lib/housekeeping/generator-service";
import { checkMissedPeriodicPhoto, checkRunTooLong } from "@/lib/housekeeping/generator-rules";

export const runtime = "nodejs";

// POST /api/housekeeping/cron/generator-checks
//
// Catches the two rules that no user action can trigger, because they are about
// something NOT happening:
//   • rule 5  — running, but the mandatory periodic photo is overdue
//   • rule 11 — still marked ON beyond the allowed duration
//
// Auth: `x-cron-secret` header (crontab) or an authenticated manager.
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

  const generators = await prisma.generator.findMany({
    where: { deletedAt: null, active: true },
    include: { center: { select: { name: true } } },
  });

  const now = new Date();
  let checked = 0;
  let raised = 0;
  const alerts: string[] = [];

  for (const gen of generators) {
    const run = await openRun(gen.id);
    if (!run) continue; // only running generators are of interest here
    checked++;

    const findings = [];

    // Rule 5 — periodic photo overdue. Measured from the most recent reading,
    // falling back to the ON event when none has been taken yet.
    const lastReading = await prisma.generatorReading.findFirst({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    const since = lastReading?.at ?? run.atServer;
    const missed = checkMissedPeriodicPhoto(since, gen, now);
    if (missed) findings.push(missed);

    // Rule 11 — running beyond the configured maximum.
    const tooLong = checkRunTooLong(run.atServer, gen, now);
    if (tooLong) findings.push(tooLong);

    if (findings.length) {
      // 1-hour dedupe window keeps a 30-minute cron from spamming the same rule.
      const n = await recordFindings(
        gen.id, gen.centerId, findings,
        { eventId: run.id, actorId: actor },
        60,
      );
      raised += n;
      if (n > 0) {
        alerts.push(
          `• ${gen.center.name} — ${gen.name} (${gen.code})\n` +
            findings.map((f) => `    ${f.severity}: ${f.title}\n    ${f.detail ?? ""}`).join("\n"),
        );
      }
    }
  }

  if (alerts.length > 0) {
    const to = (process.env.HK_ESCALATION_EMAILS || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) {
      const admins = await prisma.user.findMany({
        where: { active: true, role: { in: ["ADMIN", "OWNER"] } },
        select: { email: true }, take: 10,
      });
      to.push(...admins.map((a) => a.email));
    }
    if (to.length > 0) {
      try {
        await sendMail(
          to.join(","),
          `[Housekeeping] Generator monitoring — ${raised} new discrepancy(ies)`,
          `Automated generator checks raised the following:\n\n${alerts.join("\n\n")}\n\n` +
            `${process.env.APP_URL || ""}/housekeeping/generator`,
        );
      } catch (e) {
        // Mail failure must not stop the findings being recorded.
        console.error("generator-checks mail failed:", e);
      }
    }
  }

  return NextResponse.json({ runningGenerators: checked, discrepanciesRaised: raised });
}
