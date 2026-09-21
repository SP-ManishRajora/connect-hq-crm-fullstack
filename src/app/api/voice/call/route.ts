import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { clickToCall, normalisePhone, voiceUiEnabled } from "@/lib/voice";
import { logAction } from "@/lib/audit";

// POST /api/voice/call — place a click-to-call from the logged-in rep to a lead.
//
// Session-only. Deliberately NO webhook-secret bypass (unlike the lead comments
// endpoint): nothing external should be able to make this system dial a number.
//
// Flow — see docs/voip/level-1-click-to-call.md §2.1. FreJun rings the rep first;
// only once they answer is the lead dialled.

// Per-user rate limit. A stuck button, or a rep hammering a number that keeps
// ringing out, must not turn into forty calls. In-memory and resets on deploy,
// which is fine — this is friction, not a security boundary. Same approach as
// the public lead intake route.
const RATE_LIMIT = 10;
const WINDOW_MS = 5 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = hits.get(userId);
  if (!entry || now > entry.resetAt) {
    hits.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !(await canAccessAsync(u.role, "leads", u.allowedModules))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `voiceUiEnabled` (not `voiceConfigured`) so VOICE_PROVIDER="console" reaches
  // the code below: the dry-run mode must exercise the whole path and record a
  // CallLog, it just never dials. clickToCall reports placed:false for it, which
  // surfaces as an honest "not configured" message rather than a fake success.
  if (!voiceUiEnabled()) {
    return NextResponse.json(
      { error: "Calling is not enabled. Set VOICE_PROVIDER and the provider credentials." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const leadId = typeof body.leadId === "string" ? body.leadId : null;
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, name: true, phone: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const leadPhone = normalisePhone(lead.phone);
  if (!leadPhone) {
    return NextResponse.json(
      { error: lead.phone ? "This lead's phone number is not a valid number." : "This lead has no phone number." },
      { status: 400 },
    );
  }

  // FreJun identifies the agent by their registered email, and dials whichever
  // device that user has configured. The rep must exist in FreJun with the same
  // email they use here.
  const agent = await prisma.user.findUnique({
    where: { id: u.id },
    select: { email: true, phone: true },
  });
  if (!agent?.email) {
    return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
  }

  sweep();
  if (rateLimited(u.id)) {
    return NextResponse.json(
      { error: "Too many calls in a short time. Please wait a few minutes." },
      { status: 429 },
    );
  }

  // Create the row BEFORE dialling. If the provider places the call but this
  // process dies before storing the id, we still have evidence a call was
  // attempted — the reconciliation job can then resolve it.
  const call = await prisma.callLog.create({
    data: {
      leadId: lead.id,
      agentId: u.id,
      direction: "OUTBOUND",
      status: "INITIATED",
      agentPhone: normalisePhone(agent.phone),
      leadPhone,
    },
    select: { id: true },
  });

  const result = await clickToCall({
    agentEmail: agent.email,
    leadPhone,
    leadName: lead.name,
    callLogId: call.id,
  });

  if (result.placed === false) {
    const reason: string = result.reason;
    const provider: string = result.provider;
    // A console dry-run is not a failure — mark it as such so the call history
    // does not fill with FAILED rows while someone is only testing the UI.
    const dryRun = provider === "console";
    await prisma.callLog.update({
      where: { id: call.id },
      data: { status: dryRun ? "CONSOLE" : "FAILED", provider, failureReason: reason },
    });
    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, callLogId: call.id, note: reason });
    }
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  await prisma.callLog.update({
    where: { id: call.id },
    data: { status: "RINGING", provider: result.provider, providerSid: result.callSid },
  });

  await logAction({
    userId: u.id,
    action: "CALL_INITIATED",
    targetType: "Lead",
    targetId: lead.id,
    meta: { callLogId: call.id, provider: result.provider },
  });

  return NextResponse.json({ ok: true, callLogId: call.id });
}
