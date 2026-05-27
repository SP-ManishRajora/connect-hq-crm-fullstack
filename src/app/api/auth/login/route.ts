import { NextRequest, NextResponse } from "next/server";
import { loginByEmail } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  const u = await loginByEmail(email, password);
  if (!u) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  return NextResponse.json({ id: u.id, role: u.role, name: u.name });
}
