import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { createIssue } from "@/lib/housekeeping/issues";

const schema = z.object({
  resolution: z.string().min(3).max(2000),
  // Optionally escalate into the Phase 6 corrective-action workflow.
  raiseIssue: z.boolean().default(false),
  assigneeId: z.string().min(1).nullish(),
});

// POST /api/housekeeping/generators/discrepancies/[id]/resolve
//
// Resolution never deletes the discrepancy — it stamps it, preserving the
// original detection as an immutable record.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(schema, await req.json());

    const d = await prisma.generatorDiscrepancy.findUnique({
      where: { id: params.id },
      include: { generator: { select: { name: true, code: true } } },
    });
    if (!d) throw Object.assign(new Error("Discrepancy not found"), { __status: 404 });
    assertCenterAllowed(u, d.centerId);
    if (d.resolvedAt) {
      throw Object.assign(new Error("This discrepancy is already resolved"), { __status: 409 });
    }

    let issueId: string | null = null;
    if (b.raiseIssue) {
      const issue = await createIssue({
        centerId: d.centerId,
        source: "MANUAL",
        category: "safety",
        title: `Generator ${d.generator.name}: ${d.title}`,
        description: d.detail,
        severity: d.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        assigneeId: b.assigneeId ?? null,
        raisedById: u.id,
      });
      issueId = issue.id;
    }

    const row = await prisma.generatorDiscrepancy.update({
      where: { id: d.id },
      data: {
        resolvedAt: new Date(),
        resolvedById: u.id,
        resolution: b.resolution,
        ...(issueId ? { issueId } : {}),
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_GENERATOR_DISCREPANCY_RESOLVED",
      targetType: "GeneratorDiscrepancy",
      targetId: row.id,
      meta: {
        ruleCode: d.ruleCode, severity: d.severity,
        resolution: b.resolution, issueRaised: issueId,
      },
    });

    return NextResponse.json({ ...row, issueId });
  } catch (e) {
    return handleError(e);
  }
}
