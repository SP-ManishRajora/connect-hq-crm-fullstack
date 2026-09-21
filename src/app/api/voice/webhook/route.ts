import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTerminalStatus, mapFrejunStatus, verifyFrejunWebhook } from "@/lib/voice";

// POST /api/voice/webhook — FreJun call event callbacks.
//
// Public but signature-verified. This endpoint is on the open internet and is
// the one an attacker would poke at, so an unverifiable request is rejected
// before it can touch the database.
//
// Register it with FreJun once per event type:
//   POST https://api.frejun.com/api/v1/integrations/create-webhook/
//   Authorization: Bearer Base64(client_id:client_secret)
//   { "event": "call.status",    "callback_url": "https://crm.connecthq.co.in/api/voice/webhook" }
//   { "event": "call.recording", "callback_url": "https://crm.connecthq.co.in/api/voice/webhook" }
//
// Events handled (docs/voip/level-1-click-to-call.md §6.2):
//   call.status    — lifecycle changes; carries duration and final status
//   call.summary   — end-of-call roll-up; also carries duration/recording
//   call.recording — recording is ready
//
// Anything authentic but unprocessable returns 200. A 5xx makes FreJun retry
// forever over a payload we are never going to accept.

export async function POST(req: NextRequest) {
  // Read the RAW body first — signature verification needs the exact bytes, so
  // it must not be re-serialised from a parsed object.
  const rawBody = await req.text();

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const callId = payload?.call_id != null ? String(payload.call_id) : null;

  const ok = verifyFrejunWebhook({
    method: req.method,
    requestUrl: req.url,
    rawBody,
    callId,
    signature: req.headers.get("frejun-signature"),
    signatureSlim: req.headers.get("frejun-signature-slim"),
  });

  if (!ok) {
    console.warn("Rejected FreJun webhook: signature verification failed", {
      event: payload?.event,
      callId,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const event = String(payload?.event || "");

  // Correlate: prefer FreJun's call_id, fall back to the transaction_id we sent
  // (our CallLog id) — needed for the window before create-call's response was
  // stored, and for any event that arrives out of order.
  const ourId =
    typeof payload?.metadata?.transaction_id === "string" ? payload.metadata.transaction_id : null;

  const call =
    (callId ? await prisma.callLog.findUnique({ where: { providerSid: callId } }) : null) ??
    (ourId ? await prisma.callLog.findUnique({ where: { id: ourId } }) : null);

  if (!call) {
    // Most likely an inbound call, or one placed outside this CRM. Nothing to
    // update; acknowledge so FreJun stops retrying.
    console.info("FreJun webhook for unknown call", { event, callId, ourId });
    return NextResponse.json({ ok: true, ignored: "unknown call" });
  }

  const data: Record<string, unknown> = {};
  if (callId && !call.providerSid) data.providerSid = callId;
  if (!call.provider) data.provider = "frejun";

  if (event === "call.recording") {
    if (typeof payload.recording_url === "string" && payload.recording_url) {
      data.recordingUrl = payload.recording_url;
    }
    await prisma.callLog.update({ where: { id: call.id }, data });
    return NextResponse.json({ ok: true });
  }

  if (event === "call.status" || event === "call.summary") {
    const next = mapFrejunStatus(payload.call_status);

    // Idempotency. FreJun retries, and events can arrive out of order. Once a
    // call is terminal, only another terminal status may change it — a late
    // "Call answered" must not resurrect a completed call. Without this, one
    // call becomes several timeline entries.
    const alreadyTerminal = isTerminalStatus(call.status);
    const applyStatus = next !== "UNKNOWN" && (!alreadyTerminal || isTerminalStatus(next));
    if (applyStatus) data.status = next;

    // FreJun reports duration in milliseconds.
    if (typeof payload.duration === "number" && payload.duration >= 0) {
      data.durationSec = Math.round(payload.duration / 1000);
    }
    if (payload.answer_time) {
      const t = new Date(payload.answer_time);
      if (!isNaN(t.getTime())) data.answeredAt = t;
    }
    if (payload.end_time) {
      const t = new Date(payload.end_time);
      if (!isNaN(t.getTime())) data.endedAt = t;
    }
    if (typeof payload.recording_url === "string" && payload.recording_url) {
      data.recordingUrl = payload.recording_url;
    }

    const updated = await prisma.callLog.update({ where: { id: call.id }, data });

    // Write the timeline entry exactly once, when the call first reaches a
    // terminal state. Doing it at dial time would fill the timeline with calls
    // that never connected.
    if (applyStatus && isTerminalStatus(next) && !alreadyTerminal && updated.leadId) {
      await prisma.comment.create({
        data: {
          leadId: updated.leadId,
          body: describeCall(next, updated.durationSec, updated.recordingUrl),
          channel: "CALL",
          authorId: updated.agentId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  }

  // Other documented events (call.insights, call.propertyChange.*) are not used
  // yet. Acknowledge rather than erroring so FreJun does not retry them.
  return NextResponse.json({ ok: true, ignored: event });
}

function describeCall(status: string, durationSec: number | null, recordingUrl: string | null): string {
  const mins = durationSec != null ? Math.floor(durationSec / 60) : 0;
  const secs = durationSec != null ? durationSec % 60 : 0;
  const length = durationSec != null && durationSec > 0 ? ` — ${mins}m ${secs}s` : "";

  const label =
    status === "COMPLETED"
      ? `Call connected${length}`
      : status === "NO_ANSWER"
        ? "Call not connected — no answer"
        : status === "BUSY"
          ? "Call not connected — line busy"
          : status === "BLOCKED_DND"
            ? "Call blocked — number on DND"
            : status === "ABANDONED"
              ? "Call cancelled before connecting"
              : "Call failed";

  return recordingUrl ? `${label}\nRecording: ${recordingUrl}` : label;
}
