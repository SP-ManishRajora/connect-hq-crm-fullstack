import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { consolidateArea } from "@/lib/housekeeping/ai/jobs";
import { AI_CATEGORIES, AI_SEVERITIES } from "@/lib/housekeeping/ai/taxonomy";

const schema = z.object({
  verdict: z.enum(["ACCEPTED", "CORRECTED", "NOT_APPLICABLE"]),
  correctedIssue: z.string().min(3).max(500).nullish(),
  correctedSeverity: z.enum(AI_SEVERITIES).nullish(),
  note: z.string().max(1000).nullish(),
});

// PATCH /api/housekeeping/ai/findings/[id] — the supervisor's verdict on a finding.
//
// Every correction is kept (brief §6: "Store all corrections for future model
// evaluation and improvement"). The original machine output stays in `raw` and
// `issue`; a correction is written alongside it, never over it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(schema, await req.json());

    const finding = await prisma.aiPhotoFinding.findUnique({ where: { id: params.id } });
    if (!finding) throw Object.assign(new Error("Finding not found"), { __status: 404 });
    if (finding.centerId) assertCenterAllowed(u, finding.centerId);

    if (b.verdict === "CORRECTED" && !b.correctedIssue && !b.correctedSeverity) {
      throw Object.assign(
        new Error("Say what was wrong — provide a corrected description or severity"),
        { __status: 400 },
      );
    }

    const row = await prisma.aiPhotoFinding.update({
      where: { id: params.id },
      data: {
        verdict: b.verdict,
        correctedIssue: b.correctedIssue ?? null,
        correctedSeverity: b.correctedSeverity ?? null,
        reviewNote: b.note ?? null,
        reviewedById: u.id,
        reviewedAt: new Date(),
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_AI_FINDING_REVIEWED",
      targetType: "AiPhotoFinding",
      targetId: row.id,
      meta: {
        verdict: b.verdict,
        original: { issue: finding.issue, severity: finding.severity, confidence: finding.confidence },
        corrected: { issue: b.correctedIssue, severity: b.correctedSeverity },
        model: finding.model,
      },
    });

    // A verdict changes the area picture — rebuild the summary.
    if (finding.visitId) await consolidateArea(finding.visitId);

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}

const addSchema = z.object({
  visitId: z.string().min(1),
  photoId: z.string().min(1),
  category: z.enum(AI_CATEGORIES),
  issue: z.string().min(3).max(500),
  severity: z.enum(AI_SEVERITIES),
});

// POST /api/housekeeping/ai/findings/[id] — record something the model MISSED.
// `[id]` is ignored; the route is colocated so the review UI has one base path.
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(addSchema, await req.json());

    const photo = await prisma.inspectionPhoto.findUnique({
      where: { id: b.photoId },
      select: { id: true, location: { select: { centerId: true } } },
    });
    if (!photo) throw Object.assign(new Error("Photograph not found"), { __status: 404 });
    assertCenterAllowed(u, photo.location.centerId);

    const row = await prisma.aiPhotoFinding.create({
      data: {
        photoId: b.photoId,
        visitId: b.visitId,
        centerId: photo.location.centerId,
        category: b.category,
        issue: b.issue,
        severity: b.severity,
        confidence: 1,           // a human saw it — full confidence
        driver: "human",
        model: "human",
        verdict: "ADDED",
        reviewedById: u.id,
        reviewedAt: new Date(),
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_AI_FINDING_ADDED",
      targetType: "AiPhotoFinding",
      targetId: row.id,
      meta: { issue: b.issue, severity: b.severity, category: b.category, missedByModel: true },
    });

    await consolidateArea(b.visitId);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
