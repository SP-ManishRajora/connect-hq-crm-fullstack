import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
} from "@/lib/housekeeping/route-helpers";

// POST /api/housekeeping/push/tokens — register this device for push.
// DELETE — stop receiving push on this device.
//
// Tokens are unique per device. When a phone is handed to a different member of
// staff Expo reissues the same token, so an upsert must RE-OWN the row to the
// current user — otherwise the previous owner keeps receiving the new owner's
// urgent notifications.
const schema = z.object({
  token: z.string().min(10).max(300),
  deviceId: z.string().max(200).optional(),
  platform: z.string().max(20).optional(),
});

export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(schema, await req.json());
    const row = await prisma.mobilePushToken.upsert({
      where: { token: body.token },
      create: {
        userId: u.id,
        token: body.token,
        deviceId: body.deviceId ?? null,
        platform: body.platform ?? "android",
      },
      update: {
        userId: u.id, // re-own on device handover
        deviceId: body.deviceId ?? null,
        lastSeenAt: new Date(),
        active: true,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(schema.pick({ token: true }), await req.json());
    await prisma.mobilePushToken.updateMany({
      // Scoped to the caller: a token string alone must not silence someone else.
      where: { token: body.token, userId: u.id },
      data: { active: false },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
