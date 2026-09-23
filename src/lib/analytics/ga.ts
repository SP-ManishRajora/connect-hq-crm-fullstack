import { BetaAnalyticsDataClient } from "@google-analytics/data";

/*
 * Google Analytics 4 reporting.
 *
 * Reads a GA4 property through Google's Data API. This is a separate source
 * from the WebEvent table in report.ts, and deliberately so: GA sees what
 * Google's tag sees, we see what /api/track sees, and the two will never agree
 * exactly. Ad-blockers hit Google's tag harder, and GA samples and thresholds
 * its own numbers. Neither is "the truth", so the dashboard shows GA's figures
 * labelled as GA's figures rather than blending them into ours.
 *
 * Credentials are a service account with Viewer access on the property. The key
 * never reaches the browser — every call here runs on the server.
 */

/** Rows GA returns are strings; everything downstream wants numbers. */
function num(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type GaConfig = {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Read config from the environment, or null when GA has not been set up.
 *
 * Returning null rather than throwing is the point: the dashboard must render
 * a "not configured yet" panel on a fresh checkout instead of a 500, and an
 * operator without the key should still be able to open the page.
 */
export function getGaConfig(): GaConfig | null {
  const propertyId = process.env.GA_PROPERTY_ID?.trim();
  const clientEmail = process.env.GA_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GA_PRIVATE_KEY;
  if (!propertyId || !clientEmail || !rawKey) return null;

  // A PEM key in a .env file arrives with literal backslash-n rather than real
  // newlines. Left unconverted, Google's auth layer rejects it with an error
  // that says nothing about the cause.
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null;

  return { propertyId, clientEmail, privateKey };
}

export function isGaConfigured(): boolean {
  return getGaConfig() !== null;
}

let cached: BetaAnalyticsDataClient | null = null;

function client(cfg: GaConfig): BetaAnalyticsDataClient {
  // One client per process: it holds a token cache, and rebuilding it on every
  // request means a fresh OAuth round-trip per panel on the page.
  if (!cached) {
    cached = new BetaAnalyticsDataClient({
      credentials: { client_email: cfg.clientEmail, private_key: cfg.privateKey },
    });
  }
  return cached;
}

/** GA wants plain YYYY-MM-DD in the property's own timezone. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type GaRange = { from: Date; to: Date; days: number };

export type GaTotals = {
  sessions: number;
  users: number;
  newUsers: number;
  pageViews: number;
  conversions: number;
  /** Seconds. GA reports this as a float. */
  avgSessionDuration: number;
  /** 0–1. GA4 calls it engagementRate; bounce is its complement. */
  engagementRate: number;
};

export type GaRow = { label: string; sessions: number; users: number; conversions: number };
export type GaDaily = { date: string; sessions: number; users: number; pageViews: number };
export type GaPage = { path: string; title: string; views: number };

export type GaReport = {
  totals: GaTotals;
  daily: GaDaily[];
  channels: GaRow[];
  sources: GaRow[];
  campaigns: GaRow[];
  countries: GaRow[];
  devices: GaRow[];
  pages: GaPage[];
};

/**
 * Everything the dashboard needs, in one batched call.
 *
 * GA's API bills per request and rate-limits per property, so the seven panels
 * are sent as one batchRunReports rather than seven round-trips.
 */
export async function getGaReport(r: GaRange): Promise<GaReport> {
  const cfg = getGaConfig();
  if (!cfg) throw new Error("Google Analytics is not configured.");

  const property = `properties/${cfg.propertyId}`;
  const dateRanges = [{ startDate: ymd(r.from), endDate: ymd(r.to) }];

  // A shared shape for the "break traffic down by X" panels, which differ only
  // in their dimension.
  const breakdown = (dimension: string, limit: number) => ({
    dateRanges,
    dimensions: [{ name: dimension }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  const [batch] = await client(cfg).batchRunReports({
    property,
    requests: [
      {
        dateRanges,
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "conversions" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
        ],
      },
      {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 400,
      },
      breakdown("sessionDefaultChannelGroup", 12),
      breakdown("sessionSource", 12),
      breakdown("sessionCampaignName", 12),
      breakdown("country", 8),
      breakdown("deviceCategory", 5),
      {
        dateRanges,
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 12,
      },
    ],
  });

  const reports = batch.reports ?? [];
  const totalsRow = reports[0]?.rows?.[0]?.metricValues ?? [];

  const totals: GaTotals = {
    sessions: num(totalsRow[0]?.value),
    users: num(totalsRow[1]?.value),
    newUsers: num(totalsRow[2]?.value),
    pageViews: num(totalsRow[3]?.value),
    conversions: num(totalsRow[4]?.value),
    avgSessionDuration: num(totalsRow[5]?.value),
    engagementRate: num(totalsRow[6]?.value),
  };

  const daily: GaDaily[] = (reports[1]?.rows ?? []).map((row) => {
    // GA returns YYYYMMDD with no separators.
    const raw = row.dimensionValues?.[0]?.value ?? "";
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      sessions: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
      pageViews: num(row.metricValues?.[2]?.value),
    };
  });

  const rowsOf = (i: number): GaRow[] =>
    (reports[i]?.rows ?? []).map((row) => ({
      label: row.dimensionValues?.[0]?.value || "(not set)",
      sessions: num(row.metricValues?.[0]?.value),
      users: num(row.metricValues?.[1]?.value),
      conversions: num(row.metricValues?.[2]?.value),
    }));

  const pages: GaPage[] = (reports[7]?.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value || "/",
    title: row.dimensionValues?.[1]?.value || "",
    views: num(row.metricValues?.[0]?.value),
  }));

  return {
    totals,
    daily,
    channels: rowsOf(2),
    sources: rowsOf(3),
    campaigns: rowsOf(4),
    countries: rowsOf(5),
    devices: rowsOf(6),
    pages,
  };
}

/**
 * Live users on the site right now. Separate from the rest because it uses a
 * different API and a failure here must not take down the whole page.
 */
export async function getGaRealtimeUsers(): Promise<number | null> {
  const cfg = getGaConfig();
  if (!cfg) return null;
  try {
    const [res] = await client(cfg).runRealtimeReport({
      property: `properties/${cfg.propertyId}`,
      metrics: [{ name: "activeUsers" }],
    });
    return num(res.rows?.[0]?.metricValues?.[0]?.value);
  } catch {
    return null;
  }
}

/** A GA failure turned into something an operator can act on. */
export function explainGaError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/PERMISSION_DENIED|403/.test(msg)) {
    return "Google refused the request. Add the service account as a Viewer on the GA4 property, and confirm GA_PROPERTY_ID is the numeric property ID (not the G-XXXXXXX measurement ID).";
  }
  if (/NOT_FOUND|404/.test(msg)) {
    return "That GA4 property was not found. Check GA_PROPERTY_ID — it is the numeric ID from Admin → Property Settings.";
  }
  if (/invalid_grant|DECODER|PEM|private key/i.test(msg)) {
    return "The service-account key was rejected. Check GA_PRIVATE_KEY is the full PEM block, quoted, with its \\n sequences intact.";
  }
  if (/Analytics Data API has not been used|SERVICE_DISABLED/i.test(msg)) {
    return "The Google Analytics Data API is not enabled for that Google Cloud project. Enable it in the Cloud console, then retry.";
  }
  return msg;
}
