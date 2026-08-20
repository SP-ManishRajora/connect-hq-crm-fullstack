import { prisma } from "@/lib/db";

// Expo push notifications for the Android staff app.
//
// SCOPE IS DELIBERATELY NARROW (docs/housekeeping-deferred.md, D-30): only
// URGENT cleaning requests and CRITICAL issues, and only to the person the work
// is assigned to. Notifying on every assignment and SLA warning is the failure
// mode that gets an app muted within a week, after which the urgent ones are
// missed too — which is the exact problem this is meant to solve.
//
// Email and in-app alerts are unchanged and remain the system of record. Push is
// an additional nudge, never the only delivery path, so an Expo outage cannot
// lose a notification.

const EXPO_API = "https://exp.host/--/api/v2/push/send";

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function isExpoToken(t: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);
}

/**
 * Send to every active device a user has registered.
 *
 * Never throws. A push failure must not roll back the assignment that triggered
 * it — the work is already assigned and visible in the app and by email.
 */
export async function pushToUser(userId: string, msg: PushMessage): Promise<number> {
  try {
    const rows = await prisma.mobilePushToken.findMany({
      where: { userId, active: true },
      select: { id: true, token: true },
    });
    const targets = rows.filter((r) => isExpoToken(r.token));
    if (targets.length === 0) return 0;

    const res = await fetch(EXPO_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        targets.map((t) => ({
          to: t.token,
          sound: "default",
          priority: "high",
          channelId: "housekeeping-urgent",
          title: msg.title,
          body: msg.body,
          data: msg.data ?? {},
        })),
      ),
      // A slow push service must not hold an assignment request open.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return 0;

    // Expo reports per-message errors in a 200 body. DeviceNotRegistered means
    // the app was uninstalled or the token rotated — deactivate it rather than
    // retrying it forever on every future send.
    const json = (await res.json()) as {
      data?: Array<{ status: string; details?: { error?: string } }>;
    };
    const tickets = json.data ?? [];
    const dead: string[] = [];
    tickets.forEach((t, i) => {
      if (t.status === "error" && t.details?.error === "DeviceNotRegistered") {
        dead.push(targets[i].id);
      }
    });
    if (dead.length) {
      await prisma.mobilePushToken.updateMany({
        where: { id: { in: dead } },
        data: { active: false },
      });
    }

    return tickets.filter((t) => t.status === "ok").length;
  } catch {
    return 0;
  }
}

/** An issue was assigned — push only when it is CRITICAL. */
export async function pushCriticalIssue(opts: {
  assigneeId: string;
  issueId: string;
  severity: string;
  title: string;
  locationName?: string | null;
}) {
  if (opts.severity !== "CRITICAL") return 0;
  return pushToUser(opts.assigneeId, {
    title: "Critical issue assigned to you",
    body: opts.locationName ? `${opts.locationName} — ${opts.title}` : opts.title,
    data: { type: "issue", id: opts.issueId },
  });
}

/** A cleaning request was assigned — push only when it is URGENT. */
export async function pushUrgentRequest(opts: {
  assigneeId: string;
  requestId: string;
  priority: string;
  summary: string;
  locationName?: string | null;
}) {
  if (opts.priority !== "URGENT") return 0;
  return pushToUser(opts.assigneeId, {
    title: "Urgent cleaning request",
    body: opts.locationName ? `${opts.locationName} — ${opts.summary}` : opts.summary,
    data: { type: "request", id: opts.requestId },
  });
}
