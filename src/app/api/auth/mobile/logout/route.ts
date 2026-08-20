import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getRequestUser } from "@/lib/auth";
import { revokeRefreshToken } from "@/lib/mobile/tokens";

// POST /api/auth/mobile/logout — sign this device out.
//
// Also deactivates the device's push token, so a signed-out phone stops
// receiving notifications for work it can no longer see.
const schema = z.object({
  refreshToken: z.string().min(1),
  pushToken: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  await revokeRefreshToken(body.refreshToken);

  if (body.pushToken) {
    const u = await getRequestUser(req);
    await prisma.mobilePushToken.updateMany({
      // Scoped to the caller so a token string alone cannot silence someone else.
      where: { token: body.pushToken, ...(u ? { userId: u.id } : {}) },
      data: { active: false },
    });
  }

  return NextResponse.json({ ok: true });
}
