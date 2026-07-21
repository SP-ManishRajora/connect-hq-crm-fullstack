import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Browser geolocation is best-effort: it needs HTTPS in production and the user can
// deny it outright. Coords are recorded when supplied and simply omitted otherwise —
// a missing fix must never block someone from marking attendance.
function readCoords(b: any) {
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const acc = Number(b?.accuracy);
  return { lat, lng, accM: Number.isFinite(acc) && acc >= 0 ? acc : null };
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { action } = body;
    const coords = readCoords(body);
    const today = startOfToday();
    const now = new Date();

    if (action === "check-in") {
      const existing = await prisma.staffAttendance.findUnique({
        where: { userId_date: { userId: me.id, date: today } },
      });
      if (existing) {
        return NextResponse.json({ error: "Already checked in today" }, { status: 400 });
      }
      const row = await prisma.staffAttendance.create({
        data: {
          userId: me.id,
          date: today,
          checkInAt: now,
          checkInLat: coords?.lat ?? null,
          checkInLng: coords?.lng ?? null,
          checkInAccM: coords?.accM ?? null,
          centerId: me.centerId || null,
        },
      });
      return NextResponse.json(row);
    }

    if (action === "check-out") {
      const existing = await prisma.staffAttendance.findUnique({
        where: { userId_date: { userId: me.id, date: today } },
      });
      if (!existing) {
        return NextResponse.json({ error: "Check in first before checking out" }, { status: 400 });
      }
      if (existing.checkOutAt) {
        return NextResponse.json({ error: "Already checked out today" }, { status: 400 });
      }
      const row = await prisma.staffAttendance.update({
        where: { id: existing.id },
        data: {
          checkOutAt: now,
          checkOutLat: coords?.lat ?? null,
          checkOutLng: coords?.lng ?? null,
          checkOutAccM: coords?.accM ?? null,
        },
      });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/my-attendance failed:", err);
    return NextResponse.json({ error: err?.message || "internal error", code: err?.code }, { status: 500 });
  }
}
