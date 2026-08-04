import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { isStub } from "@/lib/housekeeping/ai";

// GET /api/housekeeping/ai/findings?visitId=…
//
// Returns the findings for a visit plus how many photographs are still queued,
// so the review panel can say "analysing…" rather than "nothing found" while
// the queue is still working.
export async function GET(req: NextRequest) {
  const u = await requireModule("housekeeping");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const visitId = searchParams.get("visitId");
    if (!visitId) {
      throw Object.assign(new Error("visitId is required"), { __status: 400 });
    }

    const visit = await prisma.inspectionVisit.findUnique({
      where: { id: visitId },
      select: {
        location: { select: { centerId: true } },
        photos: { select: { id: true, aiStatus: true } },
      },
    });
    if (!visit) throw Object.assign(new Error("Visit not found"), { __status: 404 });
    assertCenterAllowed(u, visit.location.centerId);

    const findings = await prisma.aiPhotoFinding.findMany({
      where: { visitId },
      orderBy: [{ severity: "asc" }, { confidence: "desc" }],
      select: {
        id: true, photoId: true, category: true, issue: true, severity: true,
        confidence: true, recommendedAction: true, verdict: true,
        correctedIssue: true, correctedSeverity: true, driver: true, model: true,
        issueId: true,
      },
    });

    const summary = await prisma.areaSummary.findUnique({ where: { visitId } });

    return NextResponse.json({
      findings,
      pending: visit.photos.filter((p) => p.aiStatus === "PENDING").length,
      total: visit.photos.length,
      stub: isStub(),
      summary,
    });
  } catch (e) {
    return handleError(e);
  }
}
