import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// GET /api/meeting-rooms — list active rooms, with optional availability filters.
// Query params (all optional):
//   centerId   — restrict to a center
//   minCapacity — only rooms seating at least N
//   start,end  — ISO datetimes; when both given, each room is annotated with
//                `available` (no CONFIRMED booking overlaps the slot).
export async function GET(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const centerId = sp.get("centerId") || undefined;
  const minCapacity = Number(sp.get("minCapacity")) || 0;
  const startStr = sp.get("start");
  const endStr = sp.get("end");

  let start: Date | null = null;
  let end: Date | null = null;
  if (startStr && endStr) {
    start = new Date(startStr);
    end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
    }
  }

  const rooms = await prisma.meetingRoom.findMany({
    where: {
      active: true,
      ...(centerId ? { centerId } : {}),
      ...(minCapacity > 0 ? { capacity: { gte: minCapacity } } : {}),
    },
    include: { center: true },
    orderBy: [{ centerId: "asc" }, { name: "asc" }],
  });

  // Annotate availability for the requested slot.
  if (start && end) {
    const clashes = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        roomId: { in: rooms.map((r) => r.id) },
        AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
      },
      select: { roomId: true },
    });
    const busy = new Set(clashes.map((c) => c.roomId));
    return NextResponse.json(rooms.map((r) => ({ ...r, available: !busy.has(r.id) })));
  }

  return NextResponse.json(rooms.map((r) => ({ ...r, available: null })));
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.name || !String(b.name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!b.centerId) {
      return NextResponse.json({ error: "centerId is required" }, { status: 400 });
    }
    const capacity = Number(b.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return NextResponse.json({ error: "capacity must be a positive number" }, { status: 400 });
    }
    // Amenities accepted as an array or a comma-separated string; stored as JSON array text.
    let amenities: string | null = null;
    const rawAmen = b.amenities;
    const list = Array.isArray(rawAmen)
      ? rawAmen
      : typeof rawAmen === "string"
      ? rawAmen.split(",")
      : [];
    const cleaned = list.map((s: any) => String(s).trim()).filter(Boolean);
    if (cleaned.length) amenities = JSON.stringify(cleaned);

    const room = await prisma.meetingRoom.create({
      data: {
        centerId: b.centerId,
        name: String(b.name).trim(),
        capacity,
        hourlyRate: Number(b.hourlyRate) || 0,
        amenities,
      },
    });
    return NextResponse.json(room);
  } catch (err: any) {
    console.error("POST /api/meeting-rooms failed:", err);
    return NextResponse.json({ error: err?.message || "create failed", code: err?.code }, { status: 500 });
  }
}
