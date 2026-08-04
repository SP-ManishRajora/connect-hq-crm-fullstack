import { NextRequest, NextResponse } from "next/server";
import { requireModule, isResponse, handleError } from "@/lib/housekeeping/route-helpers";
import { buildOpenApi } from "@/lib/housekeeping/openapi";

// GET /api/housekeeping/openapi — the machine-readable spec.
//
// Session-gated on purpose: it enumerates every endpoint and its auth model,
// which is a useful map for an attacker and of no use to an anonymous visitor.
export async function GET(req: NextRequest) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const origin = process.env.APP_URL || new URL(req.url).origin;
    return NextResponse.json(buildOpenApi(origin), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    return handleError(e);
  }
}
