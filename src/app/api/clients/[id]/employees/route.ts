import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { loginCapFor, passwordError } from "@/lib/client-auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const exists = await prisma.user.findUnique({ where: { email: b.email } });
  if (exists) return NextResponse.json({ error: "Email already in use" }, { status: 400 });

  // Directly-created client logins count against the same login cap as invites.
  const { cap, remaining } = await loginCapFor(params.id);
  if (remaining <= 0) {
    return NextResponse.json({ error: `Login limit reached (${cap} allowed).` }, { status: 409 });
  }
  const pwErr = passwordError(b.password || "");
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const passwordHash = await hashPassword(b.password);
  const u = await prisma.user.create({
    data: {
      name: b.name,
      email: b.email,
      passwordHash,
      role: "CLIENT",
      employerClientId: params.id,
      designation: b.designation || null,
      phone: b.phone || null,
      aadhaar: b.aadhaar || null,
      pan: b.pan || null,
    },
  });
  return NextResponse.json({ id: u.id });
}
