/*
 * Inbound calls — interpretation.
 *
 * FreJun reports calls to our published number on the same webhook as the
 * calls the CRM places (call_type "inbound"). This file decides what such a
 * call means: whether it was answered, which website tap (if any) led to it,
 * whether that tap was on a Google forwarding number, and whether an unknown
 * caller has earned a lead. docs/voip/level-3-inbound-ivr.md §4 and §6 are the
 * spec.
 *
 * Pure functions only, no Prisma, so they can be tested directly — the queries
 * live in inboundCallStore.ts.
 */

import { normalisePhone } from "@/lib/voice";

/** An unknown caller must talk at least this long to become a lead (§6). */
export const MIN_LEAD_CALL_SECONDS = 15;

/**
 * How far back from the ring a website tap may be and still be this call.
 * Dialling follows a tap within seconds; ten minutes allows for a visitor who
 * copied the number and rang from another phone. The small forward allowance
 * covers clock skew between the browser, FreJun and this server.
 */
export const TAP_WINDOW_BEFORE_MS = 10 * 60 * 1000;
export const TAP_WINDOW_AFTER_MS = 60 * 1000;

/** The site's own number, used when SITE_PHONE_NUMBERS is not set. */
const DEFAULT_SITE_NUMBER = "+916300907795";

export function isInboundPayload(payload: any): boolean {
  return String(payload?.call_type || "").toLowerCase() === "inbound";
}

/**
 * Read a FreJun timestamp.
 *
 * Documented only as "timestamp", and seen as Unix seconds, Unix milliseconds
 * and ISO strings. new Date(seconds) would silently land in January 1970, so
 * numbers are scaled by magnitude rather than trusted.
 */
export function parseFrejunTime(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let d: Date;
  const n = typeof raw === "number" ? raw : /^\d+(\.\d+)?$/.test(String(raw)) ? Number(raw) : NaN;
  if (!isNaN(n)) {
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    d = new Date(String(raw));
  }
  return isNaN(d.getTime()) ? null : d;
}

/**
 * The numbers that are ours: the site number and the FreJun virtual number.
 * A tap on any other number means Google had swapped in a forwarding number.
 */
export function ownNumbers(env: Record<string, string | undefined> = process.env): Set<string> {
  const raw = [
    ...(env.SITE_PHONE_NUMBERS || DEFAULT_SITE_NUMBER).split(","),
    env.FREJUN_VIRTUAL_NUMBER || "",
  ];
  const out = new Set<string>();
  for (const r of raw) {
    const n = normalisePhone(r);
    if (n) out.add(n);
  }
  return out;
}

export type TapCandidate = {
  id: string;
  occurredAt: Date;
  /** The number on the tapped link, from the tap's meta. */
  number: string | null;
  gclid: string | null;
};

/**
 * The website tap this call came from, or null.
 *
 * Only a single tap in the window is trusted. A tap carries no caller number,
 * so two taps before one call cannot be told apart, and guessing would hand
 * one visitor's campaign to another caller. Those calls stay unmatched and a
 * salesperson can still link them from the Website Calls report.
 */
export function pickTap(taps: TapCandidate[], ringAt: Date): TapCandidate | null {
  const from = ringAt.getTime() - TAP_WINDOW_BEFORE_MS;
  const to = ringAt.getTime() + TAP_WINDOW_AFTER_MS;
  const inWindow = taps.filter((t) => {
    const at = t.occurredAt.getTime();
    return at >= from && at <= to;
  });
  return inWindow.length === 1 ? inWindow[0] : null;
}

/**
 * CallLog.callSource for an inbound call.
 *
 * GOOGLE_ADS only when the tapped link held a number that is not ours — that
 * is a Google forwarding number, the one case Google itself counts the call.
 * An ad visitor who tapped our real number is WEBSITE; the gclid still rides
 * along on the lead, so the sale is uploadable either way.
 */
export function inboundCallSource(tap: TapCandidate | null, own: Set<string>): "GOOGLE_ADS" | "WEBSITE" | "DIRECT" {
  if (!tap) return "DIRECT";
  const tapped = normalisePhone(tap.number);
  if (tapped && !own.has(tapped)) return "GOOGLE_ADS";
  return "WEBSITE";
}

/**
 * The final status of an inbound call.
 *
 * FreJun has no documented "missed" status: an inbound call nobody picked up
 * still ends as "Call completed", just without an answer time. Recording that
 * as COMPLETED would show missed enquiries as conversations.
 */
export function inboundFinalStatus(status: string, answeredAt: Date | null, durationSec: number | null): string {
  if (status === "COMPLETED" && !answeredAt && !durationSec) return "NO_ANSWER";
  return status;
}

/** Whether an unknown caller's call is substantial enough to create a lead. */
export function earnsLead(status: string, durationSec: number | null): boolean {
  return status === "COMPLETED" && (durationSec ?? 0) >= MIN_LEAD_CALL_SECONDS;
}

/** The last ten digits, which is how Lead/User/Client phones are matched. */
export function localDigits(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** The timeline entry for an inbound call. */
export function describeInboundCall(args: {
  status: string;
  durationSec: number | null;
  recordingUrl: string | null;
  callSource: string;
  tapPath?: string | null;
  utmCampaign?: string | null;
}): string {
  const d = args.durationSec ?? 0;
  const length = d > 0 ? ` — ${Math.floor(d / 60)}m ${d % 60}s` : "";

  const label =
    args.status === "COMPLETED"
      ? `Inbound call answered${length}`
      : args.status === "BUSY"
        ? "Missed inbound call — line busy"
        : "Missed inbound call — call back";

  const origin =
    args.callSource === "GOOGLE_ADS"
      ? `\nFrom a Google Ads click (forwarding number)${args.tapPath ? ` on ${args.tapPath}` : ""}`
      : args.callSource === "WEBSITE"
        ? `\nTapped the number on the website${args.tapPath ? ` (${args.tapPath})` : ""}`
        : "";
  const campaign = args.utmCampaign ? ` — campaign: ${args.utmCampaign}` : "";

  return label + origin + (origin ? campaign : "") + (args.recordingUrl ? `\nRecording: ${args.recordingUrl}` : "");
}
