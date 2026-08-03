import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp, cap } from "@/lib/housekeeping/rate-limit";
import { CR_STATUS_META, transition, markComplaint, type CrStatus } from "@/lib/housekeeping/requests";
import { logAction } from "@/lib/audit";
import { raiseAlert, appUrl, ALERT_TYPES } from "@/lib/housekeeping/alerts";

export const runtime = "nodejs";

// PUBLIC, token-authenticated. The 22-char token is the only credential, so the
// response is deliberately minimal: progress and area only — never the
// assignee's name, internal ids, or other clients' data.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const limit = rateLimit(`crstatus:${clientIp(req)}`, 60, 10 * 60 * 1000);
  if (limit.limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const r = await prisma.cleaningRequest.findUnique({
    where: { statusToken: params.token },
    include: {
      location: { select: { name: true } },
      center: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
    },
  });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ticketNo: r.ticketNo,
    type: r.typeNameSnapshot,
    area: r.location?.name ?? null,
    centre: r.center.name,
    status: r.status,
    statusLabel: CR_STATUS_META[r.status as CrStatus]?.client ?? r.status,
    priority: r.priority,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    dueAt: r.dueAt,
    awaitingConfirmation: r.status === "AWAITING_CONFIRMATION" || r.status === "COMPLETED",
    confirmation: r.confirmation,
    rating: r.rating,
    progress: r.events.map((e) => ({
      status: e.toStatus,
      label: CR_STATUS_META[e.toStatus as CrStatus]?.client ?? e.toStatus,
      at: e.createdAt,
    })),
  });
}

// PUBLIC — the client confirms the outcome (brief §31).
// "Not completed" automatically reopens the request and notifies.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const limit = rateLimit(`crconfirm:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (limit.limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const b = await req.json().catch(() => ({}));
    const verdict = cap(b.confirmation, 20);
    if (!verdict || !["SATISFACTORY", "PARTIAL", "NOT_COMPLETED"].includes(verdict)) {
      return NextResponse.json({ error: "Choose an option." }, { status: 400 });
    }
    const ratingRaw = Number(b.rating);
    const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
    const comment = cap(b.comment, 1000);

    const r = await prisma.cleaningRequest.findUnique({
      where: { statusToken: params.token },
      include: { location: { select: { name: true } }, center: { select: { name: true } } },
    });
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["COMPLETED", "AWAITING_CONFIRMATION"].includes(r.status)) {
      return NextResponse.json(
        { error: "This request is not awaiting your confirmation." },
        { status: 409 },
      );
    }

    const notDone = verdict === "NOT_COMPLETED";

    await prisma.cleaningRequest.update({
      where: { id: r.id },
      data: {
        confirmation: verdict, rating, clientComment: comment, confirmedAt: new Date(),
        ...(notDone ? { reopenCount: { increment: 1 } } : {}),
      },
    });

    await transition(r.id, notDone ? "REOPENED" : "CLOSED", {
      byClient: true,
      note: `Client: ${verdict}${rating ? ` (${rating}/5)` : ""}${comment ? ` — ${comment}` : ""}`,
      extra: notDone ? {} : { closedAt: new Date() },
    });

    // A reopen converts the request into a complaint and notifies (brief §33).
    if (notDone) {
      await markComplaint(r.id, "Client reported the work as not completed");
      await raiseAlert({
        centerId: r.centerId,
        alertType: ALERT_TYPES.ISSUE_OVERDUE,
        severity: "HIGH",
        title: `Reopened by client — ${r.ticketNo} (${r.location?.name ?? r.center.name})`,
        body:
          `The client reported this cleaning request as NOT COMPLETED.\n\n` +
          `Ticket:  ${r.ticketNo}\nArea:    ${r.location?.name ?? "—"}\n` +
          `Type:    ${r.typeNameSnapshot}\n${comment ? `Comment: ${comment}\n` : ""}` +
          `\n${appUrl(`/housekeeping/requests?id=${r.id}`)}`,
        subjectType: "CleaningRequest",
        subjectId: r.id,
        dedupeKey: `cr:${r.id}:reopen:${r.reopenCount + 1}`,
      });
    }

    await logAction({
      userId: null,
      action: notDone ? "HK_CLEANING_REQUEST_REOPENED" : "HK_CLEANING_REQUEST_CONFIRMED",
      targetType: "CleaningRequest",
      targetId: r.id,
      meta: { ticketNo: r.ticketNo, verdict, rating, byClient: true },
    });

    return NextResponse.json({ ok: true, status: notDone ? "REOPENED" : "CLOSED" });
  } catch (e: any) {
    const status = e?.status ?? e?.__status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status });
  }
}
