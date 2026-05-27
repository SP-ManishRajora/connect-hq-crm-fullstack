import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");

const PUBLIC_PATHS = [
  "/login",
  "/lead-form",
  "/api/auth/login",
  "/api/leads/public",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (pathname.startsWith("/qr/")) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/uploads/")) return true;
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
