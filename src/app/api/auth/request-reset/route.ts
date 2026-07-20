import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";

// PUBLIC — User submits email + reason. We DO NOT confirm whether the email
// exists (to avoid enumeration). We create a request only if the user exists,
// then notify all admins by email.
export async function POST(req: NextRequest) {
  const { email, reason } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    await prisma.passwordResetRequest.create({ data: { userId: user.id, reason: reason || null } });
    const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "OWNER"] }, active: true } });
    for (const a of admins) {
      await sendMail(a.email, `Password reset requested: ${user.email}`,
        `User ${user.name} (${user.email}) has requested a password reset.\nReason: ${reason || "(none)"}\n\nReview at /users (Password Resets section).`);
    }
  }
  // Always return ok to avoid revealing whether the email exists.
  return NextResponse.json({ ok: true });
}
