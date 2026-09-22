import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanBatch, classifyDevice, ipPrefix } from "@/lib/analytics/events";

/*
 * Website analytics ingest.
 *
 * Called by assets/js/chq-track.js on connecthq.co.in, from the visitor's
 * browser — so it is necessarily public and cannot require a secret. Everything
 * it accepts is therefore treated as hostile: the payload is size-capped before
 * parsing, each event is validated against a whitelist (src/lib/analytics),
 * and callers are rate limited per IP.
 *
 * It answers 204 to almost everything, including garbage. A tracker that
 * surfaces errors to a visitor's console on a marketing site is worse than one
 * that quietly drops a bad beacon, and an attacker learns nothing from the
 * response either way. Real failures are logged server-side.
 *
 * Deliberately NOT what the dashboard reads for revenue: these rows say what a
 * browser claimed happened. Leads and bookings remain the source of truth for
 * anything that matters commercially.
 */

// One page view per row, so the ceiling is generous — but not unlimited, or a
// single client could write rows as fast as it can loop.
const RATE_LIMIT = 120; // events per window
const WINDOW_MS = 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

// A beacon of 25 events is already generous; anything much larger is not ours.
const MAX_BODY_BYTES = 64 * 1024;

function rateLimited(ip: string, cost: number): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: cost, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += cost;
  return entry.count > RATE_LIMIT;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
}

/*
 * Which origins may post events.
 *
 * ANALYTICS_ALLOWED_ORIGINS is a comma-separated list; unset means allow any,
 * which keeps local development and the static site working before anyone has
 * configured it. This is a CORS courtesy, not a security boundary — a browser
 * enforces it, curl does not — so it is not the thing keeping junk out. The
 * validation and rate limit are.
 */
function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  const configured = (process.env.ANALYTICS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (!configured.length) return origin || "*";
  if (origin && configured.includes(origin.replace(/\/$/, ""))) return origin;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(allowedOrigin(req)) });
}

export async function POST(req: NextRequest) {
  const origin = allowedOrigin(req);
  const headers = corsHeaders(origin);

  // A browser would have been stopped by the preflight; this covers the rest.
  if (origin === null) return new NextResponse(null, { status: 204, headers: corsHeaders(null) });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Reject oversized bodies before reading them into memory.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return new NextResponse(null, { status: 204, headers });

  const body = await req.text().catch(() => "");
  if (!body || body.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204, headers });

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 204, headers });
  }

  // sendBeacon posts {events:[...]}; a plain fetch may post a bare array or one
  // object. Accept all three so the client stays simple.
  const raw =
    parsed && typeof parsed === "object" && "events" in (parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>).events
      : parsed;

  const events = cleanBatch(raw);
  if (!events.length) return new NextResponse(null, { status: 204, headers });

  sweep();
  if (rateLimited(ip, events.length)) {
    return new NextResponse(null, { status: 204, headers });
  }

  // Derived server-side, never taken from the payload: a client could otherwise
  // claim any device or address it liked.
  const { device, browser, os } = classifyDevice(req.headers.get("user-agent"));
  const prefix = ipPrefix(ip);
  const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;

  try {
    await prisma.webEvent.createMany({
      data: events.map((e) => ({ ...e, device, browser, os, country, ipPrefix: prefix })),
    });
  } catch (err) {
    // Never surface a database problem to a marketing page. Losing a page view
    // is acceptable; an error in a visitor's console is not.
    console.error("[track] failed to store events", err);
  }

  return new NextResponse(null, { status: 204, headers });
}

export const maxDuration = 10;
