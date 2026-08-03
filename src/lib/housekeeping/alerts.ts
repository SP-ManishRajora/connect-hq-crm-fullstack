// Alert engine: raise → resolve recipients → email → log delivery.
//
// One entry point, `raiseAlert()`, used by issues, generator discrepancies and
// the cron jobs. Deduped by `dedupeKey` so a repeating condition (or a re-run
// cron) alerts once rather than every pass.
//
// Failure policy: a mail failure NEVER loses the alert. The HkAlert row is
// written first, the NotificationLog records the failure, and the operator can
// still see it in-app.

import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { logAction } from "@/lib/audit";

export const ALERT_TYPES = {
  GENERATOR_DISCREPANCY: "GENERATOR_DISCREPANCY",
  CRITICAL_ISSUE: "CRITICAL_ISSUE",
  ISSUE_OVERDUE: "ISSUE_OVERDUE",
  MISSED_INSPECTION: "MISSED_INSPECTION",
  SUSPICIOUS_SCAN: "SUSPICIOUS_SCAN",
  DUPLICATE_PHOTO: "DUPLICATE_PHOTO",
  DAILY_SUMMARY: "DAILY_SUMMARY",
} as const;

export type AlertType = (typeof ALERT_TYPES)[keyof typeof ALERT_TYPES];

// Which email-group kinds should receive each alert type. Falls back to
// MANAGEMENT, then to active admins, so an alert is never silently swallowed.
const ROUTING: Record<string, string[]> = {
  GENERATOR_DISCREPANCY: ["SECURITY", "FACILITY", "MANAGEMENT"],
  CRITICAL_ISSUE: ["FACILITY", "MANAGEMENT"],
  ISSUE_OVERDUE: ["FACILITY", "MANAGEMENT"],
  MISSED_INSPECTION: ["FACILITY", "MANAGEMENT"],
  SUSPICIOUS_SCAN: ["MANAGEMENT"],
  DUPLICATE_PHOTO: ["MANAGEMENT"],
  DAILY_SUMMARY: ["MANAGEMENT"],
};

export type RaiseAlertInput = {
  centerId: string;
  alertType: AlertType;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  body?: string;
  subjectType?: string;
  subjectId?: string;
  dedupeKey?: string;
  meta?: Record<string, unknown>;
  /** Skip email and record in-app only. */
  inAppOnly?: boolean;
};

export type RaiseResult = {
  alertId: string | null;
  deduped: boolean;
  emailed: number;
  emailStatus: "SENT" | "FAILED" | "SKIPPED";
};

export async function raiseAlert(input: RaiseAlertInput): Promise<RaiseResult> {
  // Dedupe first — `dedupeKey` is unique in the schema, but check explicitly so
  // a repeat is a clean no-op rather than a caught constraint error.
  if (input.dedupeKey) {
    const existing = await prisma.hkAlert.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing) {
      return { alertId: existing.id, deduped: true, emailed: 0, emailStatus: "SKIPPED" };
    }
  }

  const alert = await prisma.hkAlert.create({
    data: {
      centerId: input.centerId,
      alertType: input.alertType,
      severity: input.severity ?? "HIGH",
      title: input.title,
      body: input.body ?? null,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });

  if (input.inAppOnly) {
    await prisma.notificationLog.create({
      data: {
        alertId: alert.id, channel: "IN_APP",
        recipients: "[]", status: "SENT", sentAt: new Date(),
      },
    });
    return { alertId: alert.id, deduped: false, emailed: 0, emailStatus: "SKIPPED" };
  }

  const { to, cc } = await resolveRecipients(input.alertType, input.centerId);
  const all = [...to, ...cc];

  if (all.length === 0) {
    await prisma.notificationLog.create({
      data: {
        alertId: alert.id, channel: "EMAIL", recipients: "[]",
        status: "SKIPPED", error: "No recipients configured",
      },
    });
    return { alertId: alert.id, deduped: false, emailed: 0, emailStatus: "SKIPPED" };
  }

  const subject = `[Housekeeping] ${input.severity ?? "HIGH"} — ${input.title}`;
  const log = await prisma.notificationLog.create({
    data: {
      alertId: alert.id, channel: "EMAIL",
      recipients: JSON.stringify(all), subject, status: "PENDING",
    },
  });

  try {
    await sendMail(to.join(","), subject, input.body ?? input.title);
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", sentAt: new Date() },
    });
    return { alertId: alert.id, deduped: false, emailed: all.length, emailStatus: "SENT" };
  } catch (e: any) {
    // The alert survives a mail outage — that is the whole point of logging separately.
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: String(e?.message ?? e) },
    });
    return { alertId: alert.id, deduped: false, emailed: 0, emailStatus: "FAILED" };
  }
}

// Group resolution: centre-specific groups first, then global groups of the
// routed kinds, then env fallback, then active admins.
export async function resolveRecipients(
  alertType: string,
  centerId: string,
): Promise<{ to: string[]; cc: string[] }> {
  const kinds = ROUTING[alertType] ?? ["MANAGEMENT"];

  const groups = await prisma.emailGroup.findMany({
    where: {
      active: true,
      OR: [
        { centerId },                                  // centre-specific
        { centerId: null, kind: { in: kinds } },       // global, routed kinds
      ],
    },
  });

  const to = new Set<string>();
  const cc = new Set<string>();
  for (const g of groups) {
    for (const e of parseList(g.toEmails)) to.add(e);
    for (const e of parseList(g.ccEmails)) cc.add(e);
  }

  if (to.size === 0) {
    for (const e of (process.env.HK_ESCALATION_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
      to.add(e);
    }
  }
  if (to.size === 0) {
    const admins = await prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "OWNER"] } },
      select: { email: true }, take: 10,
    });
    for (const a of admins) to.add(a.email);
  }

  // Never CC someone already on the TO line.
  for (const e of to) cc.delete(e);
  return { to: [...to], cc: [...cc] };
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String).map((s) => s.trim()).filter(Boolean) : [];
  } catch {
    // Tolerate a plain comma-separated string.
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export async function acknowledgeAlert(alertId: string, userId: string) {
  const row = await prisma.hkAlert.update({
    where: { id: alertId },
    data: { status: "ACKNOWLEDGED", ackById: userId, ackAt: new Date() },
  });
  await logAction({
    userId, action: "HK_ALERT_ACKNOWLEDGED",
    targetType: "HkAlert", targetId: alertId,
    meta: { alertType: row.alertType, severity: row.severity },
  });
  return row;
}

// Builds the rich email body the brief §12 asks for: centre, area, time, user,
// readings, delta, severity, action and a deep link.
export function buildAlertBody(fields: {
  centre: string;
  area?: string | null;
  when?: Date;
  user?: string | null;
  alertType: string;
  previous?: string | null;
  current?: string | null;
  delta?: number | null;
  findings?: string | null;
  severity: string;
  action?: string | null;
  link?: string | null;
}): string {
  const L: string[] = [];
  L.push(`Centre:      ${fields.centre}`);
  if (fields.area) L.push(`Area:        ${fields.area}`);
  L.push(`Date/time:   ${(fields.when ?? new Date()).toISOString().slice(0, 16).replace("T", " ")}`);
  if (fields.user) L.push(`User:        ${fields.user}`);
  L.push(`Alert type:  ${fields.alertType}`);
  L.push(`Severity:    ${fields.severity}`);
  if (fields.previous != null) L.push(`Previous:    ${fields.previous}`);
  if (fields.current != null) L.push(`Current:     ${fields.current}`);
  if (fields.delta != null) L.push(`Difference:  ${fields.delta}`);
  if (fields.findings) L.push(`\nFindings:\n${fields.findings}`);
  if (fields.action) L.push(`\nRecommended action:\n${fields.action}`);
  if (fields.link) L.push(`\nOpen in dashboard:\n${fields.link}`);
  return L.join("\n");
}

export function appUrl(path = ""): string {
  return `${process.env.APP_URL || ""}${path}`;
}
