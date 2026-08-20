import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rotateRefreshToken } from "@/lib/mobile/tokens";

// POST /api/auth/mobile/refresh — exchange a refresh token for a new pair.
//
// Rotation is single-use: the presented token is revoked here. A 401 means the
// app must send the user back to the login screen; it should not retry.
const schema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  const pair = await rotateRefreshToken(body.refreshToken, body.deviceId);
  if (!pair) {
    return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 });
  }
  return NextResponse.json(pair);
}
