import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { transition, complaintReason, markComplaint, type CrStatus } from "@/lib/housekeeping/requests";
import { getRequestConfig } from "@/lib/housekeeping/settings";
import { verifyRequestCompletion, isStub } from "@/lib/housekeeping/ai";

const schema = z.object({
  action: z.enum(["ASSIGN", "ACCEPT", "ON_THE_WAY", "START", "COMPLETE", "UNABLE", "CANCEL"]),
  assigneeId: z.string().min(1).nullish(),
  note: z.string().max(1000).nullish(),
  /** Client QR code re-scanned at the area — brief §28 requires it to complete. */
  qrCode: z.string().max(64).nullish(),
});

// POST /api/housekeeping/requests/[id]/action
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_requests");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(schema, await req.json());

    const r = await prisma.cleaningRequest.findUnique({
      where: { id: params.id },
      include: {
        location: { select: { id: true, name: true } },
        type: { select: { requiresPhotos: true } },
        _count: { select: { photos: true } },
      },
    });
    if (!r) throw Object.assign(new Error("Request not found"), { __status: 404 });
    assertCenterAllowed(u, r.centerId);

    const cfg = await getRequestConfig();
    const now = new Date();
    const isAssignee = r.assigneeId === u.id;
    const isManager = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(u.role);

    // Only the assignee (or a manager) may progress the work.
    if (["ACCEPT", "ON_THE_WAY", "START", "COMPLETE", "UNABLE"].includes(b.action) && !isAssignee && !isManager) {
      throw Object.assign(new Error("This request is assigned to someone else"), { __status: 403 });
    }

    let to: CrStatus;
    let extra: Record<string, unknown> = {};

    switch (b.action) {
      case "ASSIGN": {
        if (!isManager && !isAssignee) {
          throw Object.assign(new Error("Not allowed"), { __status: 403 });
        }
        if (!b.assigneeId) throw Object.assign(new Error("Choose an assignee"), { __status: 400 });
        to = "ASSIGNED";
        extra = { assigneeId: b.assigneeId };
        break;
      }
      case "ACCEPT":     to = "ACCEPTED";    extra = { acceptedAt: now }; break;
      case "ON_THE_WAY": to = "ON_THE_WAY";  extra = { onTheWayAt: now }; break;
      case "START":      to = "IN_PROGRESS"; extra = { startedAt: now }; break;
      case "UNABLE":     to = "ASSIGNED";    break;
      case "CANCEL":
        if (!isManager) throw Object.assign(new Error("Only a manager can cancel"), { __status: 403 });
        to = "CANCELLED"; extra = { closedAt: now };
        break;

      case "COMPLETE": {
        // Brief §28 — the staff member should re-scan the area QR. We verify the
        // code genuinely belongs to THIS request's area; a mismatch is rejected
        // rather than quietly accepted.
        let qrVerified = false;
        if (b.qrCode) {
          const qr = await prisma.clientQrCode.findUnique({
            where: { code: b.qrCode },
            select: { locationId: true, active: true },
          });
          if (!qr || !qr.active) {
            throw Object.assign(new Error("That QR code is not recognised"), { __status: 400 });
          }
          if (r.locationId && qr.locationId !== r.locationId) {
            throw Object.assign(
              new Error(`That QR belongs to a different area — scan the code in ${r.location?.name}`),
              { __status: 400 },
            );
          }
          qrVerified = true;
        } else if (cfg.requireQrOnComplete) {
          throw Object.assign(
            new Error("Scan the QR code at the area to confirm you are there"),
            { __status: 400 },
          );
        }

        // Brief §28 — at least one after photograph; serious request types may
        // demand more (CleaningRequestType.requiresPhotos).
        const needed = r.type?.requiresPhotos ?? 1;
        const afterCount = await prisma.cleaningRequestPhoto.count({
          where: { requestId: r.id, kind: "AFTER" },
        });
        if (afterCount < needed) {
          throw Object.assign(
            new Error(
              needed === 1
                ? "Upload at least one after-cleaning photograph"
                : `This request needs ${needed} after-cleaning photographs — ${afterCount} uploaded`,
            ),
            { __status: 400 },
          );
        }

        to = cfg.requireClientConfirmation ? "AWAITING_CONFIRMATION" : "COMPLETED";
        extra = {
          completedAt: now,
          qrVerified,
          qrVerifiedAt: qrVerified ? now : null,
          ...(cfg.requireClientConfirmation ? {} : { closedAt: null }),
        };
        break;
      }
    }

    const row = await transition(r.id, to, {
      actorId: u.id,
      note: b.note ?? (b.action === "UNABLE" ? "Unable to complete" : null),
      extra,
    });

    // Brief §29 — AI verification of the after-photograph. ADVISORY ONLY: the
    // completion has already been recorded above, and a negative verdict never
    // reverses it. Wrapped so an AI outage cannot fail a completion.
    let aiVerdict: { appearsCompleted: boolean; needsReview: boolean; comment: string | null } | null = null;
    if (b.action === "COMPLETE" && !isStub()) {
      try {
        const v = await verifyRequestCompletion(r.id);
        if (v) {
          aiVerdict = {
            appearsCompleted: v.value.appears_completed,
            needsReview: Boolean(v.value.needs_supervisor_review) || !v.value.appears_completed,
            comment: v.value.comment ?? null,
          };
          await logAction({
            userId: u.id,
            action: "HK_CLEANING_REQUEST_AI_VERIFIED",
            targetType: "CleaningRequest",
            targetId: r.id,
            meta: {
              ticketNo: r.ticketNo, model: v.info.model,
              appearsCompleted: v.value.appears_completed,
              confidence: v.value.confidence,
              remainingIssues: v.value.remaining_issues,
              // Recorded, not enforced — a human decides.
              advisory: true,
            },
          });
        }
      } catch (e) {
        console.error("AI verification failed (completion unaffected):", e);
      }
    }

    // A completion without a QR scan is worth a manager's attention.
    if (b.action === "COMPLETE" && !row.qrVerified) {
      await logAction({
        userId: u.id,
        action: "HK_CLEANING_REQUEST_COMPLETED_WITHOUT_QR",
        targetType: "CleaningRequest",
        targetId: row.id,
        meta: { ticketNo: row.ticketNo, area: r.location?.name },
      });
    }

    // Complaint conversion (brief §33).
    const reason = complaintReason(row);
    if (reason) await markComplaint(row.id, reason);

    await logAction({
      userId: u.id,
      action: `HK_CLEANING_REQUEST_${b.action}`,
      targetType: "CleaningRequest",
      targetId: row.id,
      meta: {
        ticketNo: row.ticketNo, from: r.status, to,
        qrVerified: row.qrVerified, convertedToComplaint: Boolean(reason),
      },
    });

    return NextResponse.json({ ...row, convertedToComplaint: Boolean(reason), aiVerdict });
  } catch (e) {
    return handleError(e);
  }
}
