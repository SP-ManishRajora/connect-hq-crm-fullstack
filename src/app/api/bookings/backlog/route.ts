import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// Roles allowed to enter backlog (historic) meeting-room bookings:
// Center Manager and above.
const BACKLOG_ROLES = ["ADMIN", "OWNER", "CENTER_MANAGER"] as const;

const MAX_ROWS = 50;

type RowResult = { index: number; ok: boolean; bookingId?: string; error?: string };

/**
 * POST /api/bookings/backlog
 *
 * Bulk-records meeting-room bookings that already happened (backlog / late entry).
 * Body: { rows: [{ roomId, clientId?, startTime, endTime, notes?, lateEntryReason? }],
 *          lateEntryReason?  // shared fallback reason for every row
 *        }
 *
 * Each row is validated and written independently — a bad row does not abort the
 * rest of the batch. The response reports per-row success/failure so the UI can
 * keep the rows that failed on screen for correction.
 */
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...BACKLOG_ROLES])) {
    return NextResponse.json(
      { error: "Only a Center Manager or above can enter backlog bookings" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "No rows supplied" }, { status: 400 });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `At most ${MAX_ROWS} rows per submission` }, { status: 400 });
  }

  const sharedReason = String(body?.lateEntryReason || "").trim();
  const now = Date.now();
  const results: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    try {
      const reason = String(r.lateEntryReason || sharedReason || "").trim();
      if (!reason) {
        results.push({ index: i, ok: false, error: "A reason is required for a backlog entry" });
        continue;
      }

      const room = await prisma.meetingRoom.findUnique({ where: { id: String(r.roomId || "") } });
      if (!room) {
        results.push({ index: i, ok: false, error: "Room not found" });
        continue;
      }

      // A Center Manager may only backfill rooms in their own center.
      if (u.role === "CENTER_MANAGER" && u.centerId && room.centerId !== u.centerId) {
        results.push({ index: i, ok: false, error: "Room belongs to another center" });
        continue;
      }

      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        results.push({ index: i, ok: false, error: "Invalid date/time" });
        continue;
      }
      const durationHrs = (end.getTime() - start.getTime()) / 3600000;
      if (durationHrs <= 0) {
        results.push({ index: i, ok: false, error: "End must be after start" });
        continue;
      }

      // Backlog means historic. A future slot belongs in the normal booking flow.
      if (start.getTime() >= now) {
        results.push({ index: i, ok: false, error: "Backlog entries must start in the past" });
        continue;
      }

      // Overlap check against confirmed bookings for the same room.
      const clash = await prisma.booking.findFirst({
        where: {
          roomId: room.id,
          status: "CONFIRMED",
          AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
        },
      });
      if (clash) {
        results.push({ index: i, ok: false, error: "Overlaps an existing booking for this room" });
        continue;
      }

      // Resolve the client (optional — a walk-in has none).
      let clientId: string | null = null;
      const requestedClientId = r.clientId ? String(r.clientId) : null;
      if (requestedClientId) {
        const target = await prisma.client.findUnique({ where: { id: requestedClientId } });
        if (!target) {
          results.push({ index: i, ok: false, error: "Client not found" });
          continue;
        }
        if (u.role === "CENTER_MANAGER" && u.centerId && target.centerId !== u.centerId) {
          results.push({ index: i, ok: false, error: "Client belongs to another center" });
          continue;
        }
        clientId = target.id;
      }

      // Quota / charge math, mirroring POST /api/bookings. Quota is measured in the
      // month the booking actually took place, not the current month.
      let isChargeable = false;
      let chargedAmount = 0;
      if (clientId) {
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (client) {
          const quotaHrs = (client.occupiedSeats || 0) * 2;
          const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
          const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
          const used = await prisma.booking.findMany({
            where: { clientId, startTime: { gte: monthStart, lte: monthEnd }, status: "CONFIRMED" },
          });
          const usedHrs = used.reduce((s, x) => s + x.durationHrs, 0);
          const remaining = Math.max(0, quotaHrs - usedHrs);
          const overHrs = Math.max(0, durationHrs - remaining);
          if (overHrs > 0) {
            isChargeable = true;
            chargedAmount = overHrs * (room.hourlyRate || 0);
          }
        }
      } else {
        isChargeable = true;
        chargedAmount = durationHrs * (room.hourlyRate || 0);
      }

      const booking = await prisma.booking.create({
        data: {
          roomId: room.id,
          centerId: room.centerId,
          bookedById: u.id,
          clientId,
          startTime: start,
          endTime: end,
          durationHrs,
          isChargeable,
          chargedAmount,
          notes: r.notes ? String(r.notes) : null,
          lateEntryReason: reason,
        },
      });

      await logAction({
        userId: u.id,
        action: "BOOKING_BACKLOG_CREATED",
        targetType: "Booking",
        targetId: booking.id,
        meta: {
          roomId: room.id,
          centerId: room.centerId,
          clientId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          durationHrs,
          chargedAmount,
          lateEntryReason: reason,
        },
      });

      results.push({ index: i, ok: true, bookingId: booking.id });
    } catch (e: any) {
      results.push({ index: i, ok: false, error: e?.message || "Could not save this row" });
    }
  }

  const created = results.filter((x) => x.ok).length;
  return NextResponse.json({ created, failed: results.length - created, results });
}
