// In-memory rate limiting for public, unauthenticated endpoints.
//
// Extracted from the proven pattern in src/app/api/leads/public/route.ts so
// Phase 9's public endpoints reuse it rather than re-implementing.
//
// Honest about what this is: spam friction, not a security boundary. The map
// resets on deploy and is per-instance, so a multi-instance deployment gets
// N× the limit. For real abuse protection put a WAF or Redis-backed limiter in
// front — see docs/housekeeping-deferred.md D-23.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  limited: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  sweep();
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, retryAfterSec: 0 };
  }

  b.count += 1;
  const limited = b.count > limit;
  return {
    limited,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: limited ? Math.ceil((b.resetAt - now) / 1000) : 0,
  };
}

// Drop expired buckets so the map cannot grow without bound.
function sweep() {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

// Same-origin browser posts are allowed even when a shared secret is set —
// our own public page cannot hold a secret.
export function sameOriginOrSecret(req: Request, secretEnv?: string): boolean {
  const secret = secretEnv ? process.env[secretEnv] : undefined;
  if (!secret) return true; // not configured → open, matching the leads route

  if (req.headers.get("x-hk-secret") === secret) return true;

  const origin = req.headers.get("origin");
  const app = process.env.APP_URL;
  if (origin && app && origin === app.replace(/\/$/, "")) return true;

  return false;
}

// Caps free text so a bot cannot write novels into the database.
export function cap(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
