import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireModule, isResponse, handleError } from "@/lib/housekeeping/route-helpers";
import { aiHealth } from "@/lib/housekeeping/ai";

// GET /api/housekeeping/ai/health — driver reachability plus queue depth.
export async function GET() {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const [health, pending, running, failed, done] = await Promise.all([
      aiHealth(),
      prisma.aiAnalysisJob.count({ where: { status: "PENDING" } }),
      prisma.aiAnalysisJob.count({ where: { status: "RUNNING" } }),
      prisma.aiAnalysisJob.count({ where: { status: "FAILED" } }),
      prisma.aiAnalysisJob.count({ where: { status: "DONE" } }),
    ]);
    return NextResponse.json({ ...health, queue: { pending, running, failed, done } });
  } catch (e) {
    return handleError(e);
  }
}
