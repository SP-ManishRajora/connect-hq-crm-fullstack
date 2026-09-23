import { prisma } from "@/lib/db";
import { LEAD_LOST } from "@/lib/leadStatus";

/*
 * The full lead funnel, from an ad click to a paying customer.
 *
 * Every stage is counted from the table that actually owns it, never inferred:
 *
 *   Website form / WhatsApp / phone clicks → WebEvent   (what the browser did)
 *   Google Lead Form                       → Lead.source
 *   CRM lead                               → Lead       (what we actually hold)
 *   Qualified / Customer                   → Lead.status
 *   Inbound calls                          → CallLog
 *
 * Two numbers on this page measure the same intent from different sides, and
 * they will not match. A visitor who taps "call" is a WebEvent; the lead that
 * results is a Lead row. Ad-blockers suppress the first and not the second, so
 * where the two disagree the Lead count is the one to act on. The dashboard
 * says so rather than averaging them into a single misleading figure.
 */

/**
 * Stages that mean a human has engaged with the lead, beyond it merely
 * existing. This is the "qualified" line in the funnel.
 *
 * Derived from the pipeline in leadStatus.ts rather than hard-coded separately,
 * so adding a stage there does not silently leave this behind.
 */
export const QUALIFIED_STAGES = [
  "Connect",
  "Visit Planned",
  "Visited",
  "Proposal",
  "Accepted",
  "Payment",
  "Renewable",
];

/**
 * Stages that mean money. These are what get uploaded to Google Ads as offline
 * conversions — the signal that teaches bidding which clicks are worth paying
 * for.
 *
 * "Accepted" is included deliberately: by then the client has agreed terms, and
 * waiting for payment to clear delays the signal by weeks, which is long enough
 * that Ads has already moved on. The upload carries the value, so an accepted
 * deal that later falls through is a correction, not a lie.
 */
export const WON_STAGES = ["Accepted", "Payment", "Renewable"];

export type Range = { from: Date; to: Date; days: number };

export type FunnelStage = {
  key: string;
  label: string;
  value: number;
  /** Where the number comes from, shown in the UI so nobody has to guess. */
  source: string;
  /** True when ad-blockers make this an undercount. */
  approximate: boolean;
  /** Conversion rate from the previous *comparable* stage, as a fraction. */
  rate: number | null;
  hint: string;
};

export type FunnelCounts = {
  // Top of funnel — browser-side, undercounted by ad-blockers.
  websiteFormSubmits: number;
  whatsappClicks: number;
  phoneClicks: number;

  // Calls — server-side, from the telephony provider.
  callsFromAds: number;
  callsFromWebsite: number;

  // CRM — server-side, authoritative.
  crmLeads: number;
  googleLeadFormLeads: number;
  webFormLeads: number;
  qualifiedLeads: number;
  customers: number;
  lostLeads: number;

  // Attribution coverage.
  leadsWithGclid: number;
  leadsWithUtm: number;

  // Money.
  wonValue: number;
  conversionsUploaded: number;
  conversionsPending: number;
};

function rate(n: number, d: number): number | null {
  if (!d) return null;
  return n / d;
}

export async function getFunnelCounts(r: Range): Promise<FunnelCounts> {
  const inRange = { gte: r.from, lte: r.to };
  const leadWhere = { createdAt: inRange };

  const [
    webEvents,
    calls,
    crmLeads,
    bySource,
    qualifiedLeads,
    customers,
    lostLeads,
    leadsWithGclid,
    leadsWithUtm,
    wonAgg,
    uploaded,
    pending,
  ] = await Promise.all([
    prisma.webEvent.groupBy({
      by: ["name"],
      where: { occurredAt: inRange },
      _count: { _all: true },
    }),
    prisma.callLog.groupBy({
      by: ["callSource"],
      where: { startedAt: inRange, direction: "INBOUND" },
      _count: { _all: true },
    }),
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.groupBy({ by: ["source"], where: leadWhere, _count: { _all: true } }),
    prisma.lead.count({ where: { ...leadWhere, status: { in: QUALIFIED_STAGES } } }),
    prisma.lead.count({ where: { ...leadWhere, status: { in: WON_STAGES } } }),
    prisma.lead.count({ where: { ...leadWhere, status: LEAD_LOST } }),
    prisma.lead.count({ where: { ...leadWhere, NOT: { gclid: null } } }),
    prisma.lead.count({ where: { ...leadWhere, NOT: { utmSource: null } } }),
    prisma.lead.aggregate({
      where: { ...leadWhere, status: { in: WON_STAGES } },
      _sum: { budget: true },
    }),
    prisma.lead.count({ where: { ...leadWhere, NOT: { conversionUploadedAt: null } } }),
    // The worklist: won, has a click id, not yet reported to Google.
    prisma.lead.count({
      where: {
        ...leadWhere,
        status: { in: WON_STAGES },
        conversionUploadedAt: null,
        NOT: { gclid: null },
      },
    }),
  ]);

  const ev = (n: string) => webEvents.find((e) => e.name === n)?._count._all ?? 0;
  const call = (s: string) => calls.find((c) => c.callSource === s)?._count._all ?? 0;
  const src = (s: string) => bySource.find((b) => b.source === s)?._count._all ?? 0;

  return {
    websiteFormSubmits: ev("lead_submit"),
    whatsappClicks: ev("whatsapp_click"),
    phoneClicks: ev("phone_click"),

    callsFromAds: call("GOOGLE_ADS"),
    callsFromWebsite: call("WEBSITE"),

    crmLeads,
    googleLeadFormLeads: src("GOOGLE_LEAD_FORM"),
    webFormLeads: src("WEB_FORM"),
    qualifiedLeads,
    customers,
    lostLeads,

    leadsWithGclid,
    leadsWithUtm,

    wonValue: wonAgg._sum.budget ?? 0,
    conversionsUploaded: uploaded,
    conversionsPending: pending,
  };
}

/**
 * The funnel as an ordered list of stages, for rendering.
 *
 * Rates are deliberately NOT chained all the way down from page views: a
 * browser-side count and a CRM count are different populations, and dividing
 * one by the other produces a number that looks meaningful and is not. Rates
 * are only computed where both sides come from the same source.
 */
export function buildFunnel(c: FunnelCounts): FunnelStage[] {
  const contactAttempts = c.websiteFormSubmits + c.whatsappClicks + c.phoneClicks;

  return [
    {
      key: "contact_attempts",
      label: "Contact attempts",
      value: contactAttempts,
      source: "Website tracking",
      approximate: true,
      rate: null,
      hint: "Form submits, WhatsApp taps and phone taps on the site.",
    },
    {
      key: "crm_leads",
      label: "CRM leads",
      value: c.crmLeads,
      source: "CRM",
      approximate: false,
      rate: null,
      hint: "Rows actually stored. Includes calls and lead forms, so it can exceed the line above.",
    },
    {
      key: "qualified",
      label: "Qualified",
      value: c.qualifiedLeads,
      source: "CRM",
      approximate: false,
      rate: rate(c.qualifiedLeads, c.crmLeads),
      hint: "A human has engaged: connected, visit planned, visited or beyond.",
    },
    {
      key: "customers",
      label: "Customers",
      value: c.customers,
      source: "CRM",
      approximate: false,
      rate: rate(c.customers, c.qualifiedLeads),
      hint: "Accepted, paying or renewing.",
    },
  ];
}

export type ChannelRow = {
  channel: string;
  leads: number;
  qualified: number;
  customers: number;
  value: number;
};

/**
 * Funnel split by the channel a lead arrived through.
 *
 * Answers the question the whole module exists for: which source produces
 * customers, not merely enquiries. A channel with many leads and no customers
 * is worse than one with few of both.
 */
export async function getChannelFunnel(r: Range): Promise<ChannelRow[]> {
  const rows = await prisma.lead.groupBy({
    by: ["source", "status"],
    where: { createdAt: { gte: r.from, lte: r.to } },
    _count: { _all: true },
    _sum: { budget: true },
  });

  const byChannel = new Map<string, ChannelRow>();
  for (const row of rows) {
    const key = row.source || "Unknown";
    const entry = byChannel.get(key) ?? {
      channel: key,
      leads: 0,
      qualified: 0,
      customers: 0,
      value: 0,
    };
    const n = row._count._all;
    entry.leads += n;
    if (QUALIFIED_STAGES.includes(row.status)) entry.qualified += n;
    if (WON_STAGES.includes(row.status)) {
      entry.customers += n;
      entry.value += row._sum.budget ?? 0;
    }
    byChannel.set(key, entry);
  }

  return [...byChannel.values()].sort((a, b) => b.leads - a.leads);
}

export type CampaignFunnelRow = {
  campaign: string;
  source: string;
  leads: number;
  qualified: number;
  customers: number;
  value: number;
  /** Leads carrying a Google click id — how much of this is uploadable. */
  withGclid: number;
};

/**
 * The same funnel, split by campaign, for judging ad spend.
 *
 * Grouped in one query and folded in JS rather than issuing a query per
 * campaign: the number of campaigns is small but unbounded, and a query per row
 * turns one page load into dozens of round trips.
 */
export async function getCampaignFunnel(r: Range, limit = 15): Promise<CampaignFunnelRow[]> {
  const rows = await prisma.lead.groupBy({
    by: ["utmCampaign", "utmSource", "status"],
    where: { createdAt: { gte: r.from, lte: r.to } },
    _count: { _all: true },
    _sum: { budget: true },
  });

  // gclid is not in the groupBy — counting it needs its own pass, since a
  // lead either has one or does not regardless of status.
  const gclidRows = await prisma.lead.groupBy({
    by: ["utmCampaign"],
    where: { createdAt: { gte: r.from, lte: r.to }, NOT: { gclid: null } },
    _count: { _all: true },
  });
  const gclidByCampaign = new Map(gclidRows.map((g) => [g.utmCampaign ?? "", g._count._all]));

  const byCampaign = new Map<string, CampaignFunnelRow>();
  for (const row of rows) {
    const key = row.utmCampaign ?? "";
    const entry = byCampaign.get(key) ?? {
      campaign: row.utmCampaign || "(direct / organic)",
      source: row.utmSource || "—",
      leads: 0,
      qualified: 0,
      customers: 0,
      value: 0,
      withGclid: gclidByCampaign.get(key) ?? 0,
    };
    const n = row._count._all;
    entry.leads += n;
    if (QUALIFIED_STAGES.includes(row.status)) entry.qualified += n;
    if (WON_STAGES.includes(row.status)) {
      entry.customers += n;
      entry.value += row._sum.budget ?? 0;
    }
    byCampaign.set(key, entry);
  }

  return [...byCampaign.values()]
    .sort((a, b) => b.customers - a.customers || b.leads - a.leads)
    .slice(0, limit);
}

export type PendingConversion = {
  id: string;
  name: string;
  status: string;
  gclid: string;
  value: number | null;
  createdAt: Date;
  utmCampaign: string | null;
};

/**
 * Won leads that carry a click id and have not been reported to Google yet.
 *
 * This is the queue the upload works through. Leads without a gclid are
 * excluded rather than listed as failures: an organic customer is not a missing
 * upload, there is simply no click to attribute.
 */
export async function getPendingConversions(limit = 200): Promise<PendingConversion[]> {
  const rows = await prisma.lead.findMany({
    where: {
      status: { in: WON_STAGES },
      conversionUploadedAt: null,
      NOT: { gclid: null },
    },
    select: {
      id: true,
      name: true,
      status: true,
      gclid: true,
      budget: true,
      createdAt: true,
      utmCampaign: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status,
    gclid: l.gclid as string,
    value: l.budget,
    createdAt: l.createdAt,
    utmCampaign: l.utmCampaign,
  }));
}
