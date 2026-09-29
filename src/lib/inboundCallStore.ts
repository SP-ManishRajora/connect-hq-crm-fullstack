import type { CallLog } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalisePhone } from "@/lib/voice";
import { parseTapMeta } from "@/lib/analytics/phoneTap";
import {
  TAP_WINDOW_AFTER_MS,
  TAP_WINDOW_BEFORE_MS,
  describeInboundCall,
  earnsLead,
  inboundCallSource,
  localDigits,
  ownNumbers,
  parseFrejunTime,
  pickTap,
  type TapCandidate,
} from "@/lib/inboundCall";

/*
 * Inbound calls — queries and writes. Interpretation lives in inboundCall.ts.
 *
 * Two moments matter:
 *   1. FreJun's first event for an unknown inbound call_id → a CallLog row.
 *   2. The call reaching a terminal status → settle it: find the caller's lead
 *      or create one, match the website tap, write the timeline entry.
 *
 * Settling happens once, at the terminal transition, and in one transaction
 * with that status change. If it fails the status is not written either, the
 * webhook returns 500, and FreJun's retry settles it again from scratch.
 */

/** The CRM user a FreJun event names as the agent, by email. */
async function agentIdFor(email: unknown): Promise<string | null> {
  if (typeof email !== "string" || !email.trim()) return null;
  const u = await prisma.user.findUnique({ where: { email: email.trim() }, select: { id: true } });
  return u?.id ?? null;
}

/**
 * The CallLog for an inbound call FreJun has just told us about.
 *
 * FreJun sends several events per call, often together, so two requests can
 * both miss the lookup and both try to create. providerSid is unique: the
 * loser gets P2002 and reads the winner's row instead of failing.
 */
export async function createInboundCall(payload: any, callId: string): Promise<CallLog> {
  const caller = normalisePhone(payload?.candidate_number) ?? (payload?.candidate_number ? String(payload.candidate_number).slice(0, 32) : null);
  try {
    return await prisma.callLog.create({
      data: {
        direction: "INBOUND",
        status: "RINGING",
        provider: "frejun",
        providerSid: callId,
        leadPhone: caller,
        agentId: await agentIdFor(payload?.call_creator),
        startedAt: parseFrejunTime(payload?.start_time) ?? new Date(),
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const row = await prisma.callLog.findUnique({ where: { providerSid: callId } });
      if (row) return row;
    }
    throw err;
  }
}

/** The answering agent may only be known on a later event. */
export async function inboundAgentUpdate(call: CallLog, payload: any): Promise<Record<string, unknown>> {
  if (call.agentId) return {};
  const agentId = await agentIdFor(payload?.call_creator);
  return agentId ? { agentId } : {};
}

/** Website phone taps near the ring that no call or lead has claimed yet. */
async function unclaimedTaps(ringAt: Date): Promise<(TapCandidate & { path: string; utmCampaign: string | null; row: any })[]> {
  const rows = await prisma.webEvent.findMany({
    where: {
      name: "phone_click",
      occurredAt: {
        gte: new Date(ringAt.getTime() - TAP_WINDOW_BEFORE_MS),
        lte: new Date(ringAt.getTime() + TAP_WINDOW_AFTER_MS),
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [calls, leads] = await Promise.all([
    prisma.callLog.findMany({ where: { phoneClickEventId: { in: ids } }, select: { phoneClickEventId: true } }),
    prisma.lead.findMany({ where: { phoneClickEventId: { in: ids } }, select: { phoneClickEventId: true } }),
  ]);
  const claimed = new Set([...calls, ...leads].map((r) => r.phoneClickEventId));

  return rows
    .filter((r) => !claimed.has(r.id))
    .map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      number: parseTapMeta(r.meta).number,
      gclid: r.gclid,
      path: r.path,
      utmCampaign: r.utmCampaign,
      row: r,
    }));
}

/**
 * The session's first page view, which is where the visitor landed and from
 * where — the tap's own referrer is usually one of our pages.
 */
async function landingOf(sessionId: string) {
  return prisma.webEvent.findFirst({
    where: { sessionId, name: "page_view" },
    orderBy: { occurredAt: "asc" },
    select: { url: true, path: true, referrer: true },
  });
}

/**
 * Settle an inbound call as it reaches its final status. `data` is the status
 * update the webhook computed; it is written in the same transaction.
 */
export async function settleInboundCall(call: CallLog, data: Record<string, unknown>): Promise<void> {
  const status = String(data.status ?? call.status);
  const durationSec = (data.durationSec as number | undefined) ?? call.durationSec;
  const recordingUrl = (data.recordingUrl as string | undefined) ?? call.recordingUrl;
  const agentId = (data.agentId as string | undefined) ?? call.agentId;
  const local = localDigits(call.leadPhone);

  // Staff ringing the office, and existing clients, are not enquiries: no
  // lead, no tap attribution. The call is still logged.
  const [staff, client, lead] = local
    ? await Promise.all([
        prisma.user.findFirst({ where: { phone: { endsWith: local }, active: true }, select: { id: true } }),
        prisma.client.findFirst({ where: { phone: { endsWith: local }, active: true }, select: { id: true } }),
        prisma.lead.findFirst({ where: { phone: { endsWith: local } }, orderBy: { createdAt: "desc" } }),
      ])
    : [null, null, null];

  if (staff || (client && !lead)) {
    await prisma.callLog.update({ where: { id: call.id }, data: { ...data, callSource: "DIRECT" } });
    return;
  }

  const taps = await unclaimedTaps(call.startedAt);
  const tap = pickTap(taps, call.startedAt) as (typeof taps)[number] | null;
  const callSource = inboundCallSource(tap, ownNumbers());

  const e = tap?.row;
  const landing = e ? await landingOf(e.sessionId) : null;
  const attribution = e
    ? {
        gclid: e.gclid,
        utmSource: e.utmSource,
        utmMedium: e.utmMedium,
        utmCampaign: e.utmCampaign,
        utmTerm: e.utmTerm,
        utmContent: e.utmContent,
        landingPage: landing?.url ?? landing?.path ?? e.url ?? e.path,
        referrer: landing?.referrer ?? e.referrer,
        websiteLeadId: e.websiteLeadId,
      }
    : {};

  const note = describeInboundCall({
    status,
    durationSec,
    recordingUrl,
    callSource,
    tapPath: tap?.path,
    utmCampaign: tap?.utmCampaign,
  });

  await prisma.$transaction(async (tx) => {
    let leadId: string | null = lead?.id ?? null;

    if (lead) {
      // Fill gaps only, as the Website Calls report does: a lead that came in
      // through a form keeps the campaign it arrived with.
      const fill: Record<string, unknown> = {};
      if (e && !lead.phoneClickEventId) fill.phoneClickEventId = e.id;
      for (const [k, v] of Object.entries(attribution)) {
        const cur = (lead as Record<string, unknown>)[k];
        if (v && (cur === null || cur === undefined || cur === "")) fill[k] = v;
      }
      if (Object.keys(fill).length) await tx.lead.update({ where: { id: lead.id }, data: fill });
    } else if (local && earnsLead(status, durationSec)) {
      const created = await tx.lead.create({
        data: {
          // Existing source values, so the Leads filters already know them.
          source: e ? "WEBSITE_CALL" : "CALL",
          name: "Unknown caller",
          phone: local,
          notes: `Auto-created from an inbound call on ${call.startedAt.toISOString().slice(0, 10)}. Update the name after speaking to them.`,
          ownerId: agentId,
          phoneClickEventId: e?.id ?? null,
          ...attribution,
        },
      });
      leadId = created.id;
    }

    await tx.callLog.update({
      where: { id: call.id },
      data: {
        ...data,
        leadId,
        callSource,
        gclid: e?.gclid ?? null,
        phoneClickEventId: e?.id ?? null,
      },
    });

    if (leadId) {
      await tx.comment.create({ data: { leadId, body: note, channel: "CALL", authorId: agentId } });
    }
  });
}
