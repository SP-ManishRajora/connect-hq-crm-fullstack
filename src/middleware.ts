import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = [
  "/login",
  "/lead-form",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/invite",              // patch v4 — public invite accept page
  "/reset",               // patch v4 — public password-reset page
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/request-reset",       // patch v4 — public reset request
  // Passwordless sign-in for CLIENT accounts. Public by necessity — the caller has
  // no session yet. Both are rate-limited per address and per IP, the request side
  // never discloses whether an account exists, and eligibility is re-checked on
  // verify before any session is issued.
  "/api/auth/otp",
  // Visitor self check-in. Verifies an email and stamps arrival; issues no session.
  "/api/visitors/self",
  "/visit",
  "/api/invites",                  // patch v4 — public invite verify/accept (token subpaths)
  "/api/password-resets/use",      // patch v4 — public token-based password set
  "/api/leads/public",
  // Phase 9 — public client cleaning requests. Scoped to these three paths
  // only; every other /api/housekeeping/* route stays session-protected.
  // All three are rate-limited in-handler (src/lib/housekeeping/rate-limit.ts).
  "/api/housekeeping/requests/public",   // submit a request
  "/api/housekeeping/requests/resolve",  // resolve a client QR → area + catalogue
  "/api/housekeeping/requests/status",   // token-scoped status + confirmation
  // Verified client reviews. Public by necessity — a member scanning a sticker has
  // no account. The OTP is the credential; all three are rate-limited in-handler
  // and the passcode itself is stored only as a salted hash.
  "/api/housekeeping/reviews/request-otp",
  "/api/housekeeping/reviews/verify-otp",
  "/api/housekeeping/reviews/public",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/qr/")) return true;
  // Legacy staff QR printouts. The page itself only redirects to /qr/a/<code>,
  // which decides what to show from the session — so gating it here would send a
  // member who scanned an old sticker to a login screen instead of the request
  // form. Nothing is disclosed: the redirect target does its own resolving.
  if (pathname.startsWith("/housekeeping/scan/")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  // PWA manifest must be fetchable without a session, or the browser never
  // offers to install the app. It contains no sensitive data.
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname.startsWith("/uploads/")) return true;
  // Public static assets (logo etc.) served from /public — needed on the unauthenticated login page.
  if (pathname === "/logo.png") return true;
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (pathname === "/") return NextResponse.redirect(new URL("/dashboard", req.url));

  const token = req.cookies.get("erp_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));
  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
