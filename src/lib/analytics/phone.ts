import { prisma } from "@/lib/db";
import type { Range } from "@/lib/analytics/report";
import { parseTapMeta, tapChannel, type Channel, type Tap } from "@/lib/analytics/phoneTap";

/*
 * Website phone taps — queries.
 *
 * Reads phone_click rows from WebEvent, works out how each tapping visitor
 * arrived, and joins any lead a salesperson has already created from the tap.
 * Interpretation lives in phoneTap.ts; this file only fetches.
 */

// A hard ceiling on rows loaded for one report. Phone taps run to hundreds a
// month, so this is only reached by abuse of the public /api/track endpoint —
// and then the page should stay fast and say it is truncated, not time out.
export const MAX_TAPS = 2000;

export type TapRow = Tap & {
  url: string | null;
  number: string | null;
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmTerm: string | null;
  landingPage: string | null;
  landingReferrer: string | null;
  device: string | null;
  websiteLeadId: string | null;
  lead: { id: string; name: string; status: string } | null;
};

/** How the session that contained each tap began: its first page view. */
async function landings(sessionIds: string[]) {
  const out = new Map<string, { path: string; url: string | null; referrer: string | null }>();
  if (!sessionIds.length) return out;

  // Chunked: an IN list of thousands of ids is slow to plan in MySQL.
  for (let i = 0; i < sessionIds.length; i += 500) {
    const rows = await prisma.webEvent.findMany({
      where: { sessionId: { in: sessionIds.slice(i, i + 500) }, name: "page_view" },
      orderBy: { occurredAt: "asc" },
      select: { sessionId: true, path: true, url: true, referrer: true },
    });
    for (const r of rows) {
      if (!out.has(r.sessionId)) out.set(r.sessionId, { path: r.path, url: r.url, referrer: r.referrer });
    }
  }
  return out;
}

/**
 * Every phone tap in the range, newest first, with its channel and any lead
 * already created from it.
 */
export async function getPhoneTaps(r: Range): Promise<{ taps: TapRow[]; truncated: boolean }> {
  const rows = await prisma.webEvent.findMany({
    where: { name: "phone_click", occurredAt: { gte: r.from, lte: r.to } },
    orderBy: { occurredAt: "desc" },
    take: MAX_TAPS + 1,
  });
  const truncated = rows.length > MAX_TAPS;
  const events = rows.slice(0, MAX_TAPS);

  const ids = events.map((e) => e.id);
  const [landing, leads, calls] = await Promise.all([
    landings([...new Set(events.map((e) => e.sessionId))]),
    ids.length
      ? prisma.lead.findMany({
          where: { phoneClickEventId: { in: ids } },
          select: { id: true, name: true, status: true, phoneClickEventId: true },
        })
      : Promise.resolve([]),
    // Taps matched automatically to a FreJun inbound call. The call's lead may
    // already have been linked to an earlier tap, so it is not always found
    // through Lead.phoneClickEventId above.
    ids.length
      ? prisma.callLog.findMany({
          where: { phoneClickEventId: { in: ids }, leadId: { not: null } },
          select: { phoneClickEventId: true, lead: { select: { id: true, name: true, status: true } } },
        })
      : Promise.resolve([]),
  ]);
  const leadByTap = new Map<string, { id: string; name: string; status: string }>();
  for (const c of calls) if (c.lead) leadByTap.set(c.phoneClickEventId as string, c.lead);
  for (const l of leads) leadByTap.set(l.phoneClickEventId as string, l);

  const taps = events.map((e): TapRow => {
    const meta = parseTapMeta(e.meta);
    const land = landing.get(e.sessionId);
    const lead = leadByTap.get(e.id) ?? null;
    const channel: Channel = tapChannel({
      gclid: e.gclid,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      // No page view in the session (blocked, or it arrived later) — fall back
      // to the tap's own referrer, which is the best remaining evidence.
      landingReferrer: land ? land.referrer : e.referrer,
    });
    return {
      id: e.id,
      occurredAt: e.occurredAt,
      visitorId: e.visitorId,
      path: e.path,
      url: e.url,
      place: meta.place,
      number: meta.number,
      channel,
      gclid: e.gclid,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      utmTerm: e.utmTerm,
      landingPage: land?.url ?? land?.path ?? null,
      landingReferrer: land?.referrer ?? null,
      device: e.device,
      websiteLeadId: e.websiteLeadId,
      leadId: lead?.id ?? null,
      lead: lead ? { id: lead.id, name: lead.name, status: lead.status } : null,
    };
  });

  return { taps, truncated };
}

/** One tap with what is needed to create a lead from it. */
export async function getPhoneTap(id: string) {
  const e = await prisma.webEvent.findUnique({ where: { id } });
  if (!e || e.name !== "phone_click") return null;
  const land = (await landings([e.sessionId])).get(e.sessionId);
  return {
    event: e,
    meta: parseTapMeta(e.meta),
    landingPage: land?.url ?? land?.path ?? e.url ?? e.path,
    // The session's first referrer is where they came from; the tap's own
    // referrer is usually one of our pages.
    referrer: land?.referrer ?? e.referrer,
  };
}
