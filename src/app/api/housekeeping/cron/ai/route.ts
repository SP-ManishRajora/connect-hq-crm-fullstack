import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { runPendingJobs } from "@/lib/housekeeping/ai/jobs";
import { isStub, aiHealth } from "@/lib/housekeeping/ai";

export const runtime = "nodejs";
// CPU inference is slow; give the batch room rather than timing out mid-photo.
export const maxDuration = 300;

// POST /api/housekeeping/cron/ai[?limit=N]
//
// Drains the analysis queue. Runs off cron precisely so that a slow or dead
// model can never affect an inspection submission (brief §6, acceptance #20).
async function authorise(req: NextRequest): Promise<boolean> {
  const secret = process.env.HK_CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const u = await getSessionUser();
  return Boolean(u && requireRole(u.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"]));
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || undefined;

  const result = await runPendingJobs(limit);
  return NextResponse.json({
    ...result,
    driver: (await aiHealth()).driver,
    // Surfaced so a scheduled run cannot quietly appear productive while the
    // stub is producing nothing of value.
    stub: isStub(),
  });
}
