import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, type SessionUser } from "@/lib/auth";
import { issueTokenPair } from "@/lib/mobile/tokens";
import { canAccessAsync } from "@/lib/roles";
import { logAction } from "@/lib/audit";

// POST /api/auth/mobile/login — bearer-token login for the Android staff app.
//
// Deliberately NOT reusing loginByEmail(): that sets an httpOnly cookie, which a
// native client cannot hold and which would be dead weight in the response. The
// password check is identical; only the credential handed back differs.
const schema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  deviceId: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const normalised = body.email.trim().toLowerCase();
  const user =
    (await prisma.user.findUnique({ where: { email: normalised } })) ??
    (await prisma.user.findFirst({ where: { email: body.email.trim() } }));

  // One message for every failure — unknown email, wrong password and a
  // deactivated account must not be distinguishable to a caller.
  const invalid = NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  if (!user || !user.active) return invalid;
  if (!(await verifyPassword(body.password, user.passwordHash))) return invalid;

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    centerId: user.centerId,
    allowedModules: user.allowedModules ?? null,
  };

  // The app is a housekeeping tool. Someone with a valid ERP password but no
  // housekeeping access gets a clear refusal here rather than an app that logs
  // in and then 403s on every screen.
  const modules = ["hk_inspect", "hk_issues", "hk_requests", "hk_generator"];
  const granted: string[] = [];
  for (const m of modules) {
    if (await canAccessAsync(user.role, m, user.allowedModules)) granted.push(m);
  }
  if (granted.length === 0) {
    return NextResponse.json(
      { error: "Your account does not have access to the housekeeping app" },
      { status: 403 },
    );
  }

  const tokens = await issueTokenPair(session, body.deviceId);

  await logAction({
    userId: user.id,
    action: "MOBILE_LOGIN",
    targetType: "User",
    targetId: user.id,
    meta: { deviceId: body.deviceId ?? null },
  });

  return NextResponse.json({
    ...tokens,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      centerId: user.centerId,
      modules: granted,
    },
  });
}
