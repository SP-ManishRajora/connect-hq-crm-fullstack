import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireModule, isResponse, parseBody, handleError,
} from "@/lib/housekeeping/route-helpers";
import { revokeDevice, restoreDevice } from "@/lib/housekeeping/devices";

const schema = z.object({
  restore: z.boolean().default(false),
  reason: z.string().max(500).nullish(),
});

// POST /api/housekeeping/devices/[id]/revoke
// `{ restore: true }` reverses it. Both directions are audited; the registration
// row itself is never deleted, so the device's history survives either way.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(schema, await req.json().catch(() => ({})));
    const row = b.restore
      ? await restoreDevice(params.id, u.id)
      : await revokeDevice(params.id, u.id, b.reason);
    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}
