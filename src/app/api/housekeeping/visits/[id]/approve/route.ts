import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import {
  parseBody, handleError, assertCenterAllowed,
  resolveUser,
} from "@/lib/housekeeping/route-helpers";
import { appUrl } from "@/lib/housekeeping/alerts";

// Roles allowed to sign off or reject an inspected area: centre manager and
// above (decided 2026-08-04). OPS supervisors do the walking; approving their
// own work is precisely what this control exists to prevent.
const APPROVER_ROLES = ["CENTER_MANAGER", "MANAGER", "OWNER", "ADMIN"];

const schema = z
  .object({
    // APPROVE — sign off · REJECT — send back for re-inspection
    // WITHDRAW — undo a previous approval
    action: z.enum(["APPROVE", "REJECT", "WITHDRAW"]).default("APPROVE"),
    reason: z.string().max(1000).nullish(),
    note: z.string().max(1000).nullish(),
  })
  // A rejection without a reason is useless to the person who has to redo the
  // work, so it is required rather than optional.
  .refine((v) => v.action !== "REJECT" || (v.reason?.trim().length ?? 0) >= 3, {
    message: "Give a reason so the inspector knows what to put right",
    path: ["reason"],
  });

// POST /api/housekeeping/visits/[id]/approve
//
// Management sign-off (or rejection) of an inspected area. Deliberately separate
// from issue verification: that closes one corrective action with an after
// photograph; this judges the inspection of the area as a whole.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = await resolveUser();
    if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!APPROVER_ROLES.includes(u.role)) {
      return NextResponse.json(
        { error: "Only a centre manager or above can approve or reject an inspection" },
        { status: 403 },
      );
    }

    const body = parseBody(schema, await req.json().catch(() => ({})));

    const visit = await prisma.inspectionVisit.findUnique({
      where: { id: params.id },
      include: {
        location: { select: { id: true, name: true, centerId: true, center: { select: { name: true } } } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!visit) throw Object.assign(new Error("Inspection not found"), { __status: 404 });
    assertCenterAllowed(u, visit.location.centerId);

    // Only a submitted inspection can be judged — approving or rejecting a
    // half-finished one would mean judging photographs that do not exist yet.
    if (visit.status !== "SUBMITTED") {
      throw Object.assign(
        new Error("This area has not been submitted yet, so there is nothing to review"),
        { __status: 409 },
      );
    }

    // The inspector cannot sign off their own round (ADMIN/OWNER may override,
    // so a one-person site is not deadlocked). Rejecting your own work is
    // allowed — that is just admitting it needs redoing.
    if (body.action === "APPROVE" && visit.userId === u.id && !["ADMIN", "OWNER"].includes(u.role)) {
      throw Object.assign(
        new Error("You inspected this area, so a colleague must approve it"),
        { __status: 403 },
      );
    }

    if (body.action === "APPROVE" && visit.approvedAt) {
      throw Object.assign(new Error("This inspection is already approved"), { __status: 409 });
    }
    if (body.action === "REJECT" && visit.rejectedAt && !visit.approvedAt) {
      throw Object.assign(new Error("This inspection is already rejected"), { __status: 409 });
    }

    const now = new Date();
    const data =
      body.action === "APPROVE"
        ? {
            approvedById: u.id, approvedAt: now, approvalNote: body.note ?? null,
            // Approving after a rejection clears the rejection stamp; the audit
            // log retains both events.
            rejectedById: null, rejectedAt: null, rejectionReason: null,
          }
        : body.action === "REJECT"
          ? {
              rejectedById: u.id, rejectedAt: now, rejectionReason: body.reason!.trim(),
              approvedById: null, approvedAt: null, approvalNote: null,
            }
          : { approvedById: null, approvedAt: null, approvalNote: body.note ?? null };

    const row = await prisma.inspectionVisit.update({
      where: { id: visit.id },
      data,
      include: {
        approvedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
      },
    });

    // --- notify the inspector that they must redo the area -------------------
    // Wrapped: a mail or alert failure must never undo a manager's decision,
    // which is already committed above.
    if (body.action === "REJECT") {
      try {
        await notifyRejection({
          visitId: visit.id,
          centerId: visit.location.centerId,
          centreName: visit.location.center.name,
          areaName: visit.location.name,
          inspector: visit.user,
          rejectedBy: u.name,
          reason: body.reason!.trim(),
        });
      } catch (e) {
        console.error("rejection notification failed (rejection stands):", e);
      }
    }

    await logAction({
      userId: u.id,
      action:
        body.action === "APPROVE" ? "HK_VISIT_APPROVED"
        : body.action === "REJECT" ? "HK_VISIT_REJECTED"
        : "HK_VISIT_APPROVAL_WITHDRAWN",
      targetType: "InspectionVisit",
      targetId: row.id,
      meta: {
        locationName: visit.location.name,
        centerId: visit.location.centerId,
        inspectedBy: visit.user.name,
        inspectedAt: visit.scannedAt,
        reason: body.reason ?? null,
        note: body.note ?? null,
      },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleError(e);
  }
}

/** In-app alert addressed to the inspector, plus an email if SMTP is configured. */
async function notifyRejection(p: {
  visitId: string;
  centerId: string;
  centreName: string;
  areaName: string;
  inspector: { id: string; name: string; email: string };
  rejectedBy: string;
  reason: string;
}) {
  const link = appUrl(`/housekeeping/inspect`);
  const body =
    `Your inspection of ${p.areaName} at ${p.centreName} has been sent back for re-inspection.\n\n` +
    `Rejected by: ${p.rejectedBy}\n` +
    `Reason:      ${p.reason}\n\n` +
    `Please visit the area again, scan its QR code and submit fresh photographs.\n\n${link}`;

  // targetUserId makes this alert the inspector's own, so it shows on their
  // Alerts screen rather than being buried in the centre-wide feed.
  await prisma.hkAlert.create({
    data: {
      centerId: p.centerId,
      alertType: "MISSED_INSPECTION",
      severity: "HIGH",
      title: `Re-inspect ${p.areaName} — your inspection was rejected`,
      body,
      subjectType: "InspectionVisit",
      subjectId: p.visitId,
      targetUserId: p.inspector.id,
      // One alert per rejection of this visit; re-rejecting after a redo makes
      // a new visit, hence a new key.
      dedupeKey: `visit:${p.visitId}:rejected`,
      meta: JSON.stringify({ areaName: p.areaName, reason: p.reason, rejectedBy: p.rejectedBy }),
    },
  });

  if (p.inspector.email) {
    await sendMail(
      p.inspector.email,
      `[Housekeeping] Re-inspect ${p.areaName} — inspection rejected`,
      body,
    );
  }
}
