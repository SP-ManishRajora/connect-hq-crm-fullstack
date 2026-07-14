import { NextRequest, NextResponse } from "next/server";
import { isValidEmail } from "@/lib/validators";
import { createResetForEmail } from "@/lib/client-auth";

// POST /api/auth/forgot-password (public) — email a reset link.
// Always returns ok:true regardless of whether the email exists (anti-enumeration).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  await createResetForEmail(email);
  return NextResponse.json({ ok: true });
}
