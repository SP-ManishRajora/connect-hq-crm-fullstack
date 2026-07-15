import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = [
  "/login",
  "/lead-form",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/leads/public",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/qr/")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
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
