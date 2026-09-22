import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public, unauthenticated lead capture (used by /lead-form and your website embed).
//
// Two callers with different trust models:
//   1. Our own /lead-form page — browser fetch, same-origin, cannot hold a secret.
//   2. Server-to-server integrations (e.g. the connecthq.co.in PHP enquiry form) —
//      these CAN hold a secret, so we require one when LEAD_WEBHOOK_SECRET is set.
//
// Requests carrying the correct x-lead-secret always pass. Same-origin browser
// posts also pass. Anything else is rejected once the secret is configured.

// Simple in-memory rate limit: N submissions per IP per window. Resets on deploy,
// which is fine — this is spam friction, not a security boundary.
const RATE_LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

// Drop expired buckets so the map can't grow without bound.
function sweep() {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret) return true; // not configured → behave as before (open)

  if (req.headers.get("x-lead-secret") === secret) return true;

  // Allow our own lead-form page: same-origin browser post.
  const origin = req.headers.get("origin");
  const appUrl = process.env.APP_URL;
  if (origin && appUrl && origin === appUrl.replace(/\/$/, "")) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  sweep();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });
  }

  const b = await req.json().catch(() => ({}));
  if (!b.name || (!b.email && !b.phone)) {
    return NextResponse.json({ error: "Provide name and (email or phone)" }, { status: 400 });
  }

  // Cap free-text so a bot can't write novels into the CRM.
  const trim = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  // Campaign attribution, sent by connecthqEmail.php from the values theme.js
  // captured on the visitor's first arrival. Every field is optional: forms on
  // pages reached organically send none of it, and our own /lead-form sends
  // none either. Caps are generous where the value is a URL or a gclid and
  // tight where it is a short label, matching the column types.
  //
  // These are attacker-controlled — they originate in the query string — so
  // they go through the same trim/cap as the rest of the free text.
  const attribution = {
    gclid: trim(b.gclid, 512),
    utmSource: trim(b.utmSource, 191),
    utmMedium: trim(b.utmMedium, 191),
    utmCampaign: trim(b.utmCampaign, 191),
    utmTerm: trim(b.utmTerm, 191),
    utmContent: trim(b.utmContent, 191),
    landingPage: trim(b.landingPage, 1000),
    referrer: trim(b.referrer, 1000),
    websiteLeadId: trim(b.websiteLeadId, 64),
  };

  const lead = await prisma.lead.create({
    data: {
      source: "WEB_FORM",
      ...attribution,
      name: trim(b.name, 200)!,
      email: trim(b.email, 200),
      phone: trim(b.phone, 40),
      company: trim(b.company, 200),
      city: trim(b.city, 100),
      area: trim(b.area, 100),
      workspaceType: trim(b.workspaceType, 100),
      seatsNeeded: b.seatsNeeded ? Number(b.seatsNeeded) || null : null,
      budget: b.budget ? Number(b.budget) || null : null,
      notes: trim(b.notes, 2000),
      centerId: b.centerId || null,
    },
  });
  return NextResponse.json({ ok: true, id: lead.id });
}
