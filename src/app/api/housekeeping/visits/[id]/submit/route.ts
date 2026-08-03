import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule,
  isResponse,
  parseBody,
  handleError,
} from "@/lib/housekeeping/route-helpers";
import { submitVisitSchema } from "@/lib/housekeeping/validators";
import { verifyDwell, mergeFlags } from "@/lib/housekeeping/verification";
import { VISIT_FLAGS } from "@/lib/housekeeping/types";

// POST /api/housekeeping/visits/[id]/submit
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_inspect");
  if (isResponse(u)) return u;

  try {
    const body = parseBody(submitVisitSchema, await req.json().catch(() => ({})));

    const visit = await prisma.inspectionVisit.findUnique({
      where: { id: params.id },
      include: {
        location: true,
        photos: { select: { slot: true } },
      },
    });
    if (!visit) throw Object.assign(new Error("Visit not found"), { __status: 404 });
    if (visit.userId !== u.id) {
      throw Object.assign(new Error("This is not your inspection"), { __status: 403 });
    }
    if (visit.status !== "SCANNED") {
      throw Object.assign(new Error("This location is already submitted"), { __status: 400 });
    }

    // Count DISTINCT slots — a retake adds a second row in the same slot and
    // must not count as extra coverage.
    const filledSlots = new Set(visit.photos.map((p) => p.slot));
    const required = visit.location.requiredPhotoCount;
    if (filledSlots.size < required) {
      throw Object.assign(
        new Error(
          `All ${required} photographs are required — ${filledSlots.size} captured so far.`,
        ),
        { __status: 400 },
      );
    }

    const { dwellSeconds, flags: dwellFlags } = verifyDwell(
      visit.scannedAt,
      visit.location.minDwellSeconds,
    );

    const row = await prisma.inspectionVisit.update({
      where: { id: visit.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        dwellSeconds,
        observations: body.observations ?? null,
        flags: mergeFlags(visit.flags, dwellFlags),
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_VISIT_SUBMITTED",
      targetType: "InspectionVisit",
      targetId: row.id,
      meta: {
        locationId: visit.locationId,
        locationName: visit.location.name,
        photos: filledSlots.size,
        dwellSeconds,
        flags: dwellFlags,
      },
    });

    return NextResponse.json({
      ...row,
      // Surfaced so the UI can warn the supervisor immediately rather than
      // letting it surface only in a manager's report later.
      tooFast: dwellFlags.includes(VISIT_FLAGS.TOO_FAST),
      minDwellSeconds: visit.location.minDwellSeconds,
      dwellSeconds,
    });
  } catch (e) {
    return handleError(e);
  }
}
