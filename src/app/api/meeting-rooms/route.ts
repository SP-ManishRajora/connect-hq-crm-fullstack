import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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
    const room = await prisma.meetingRoom.create({
      data: {
        centerId: b.centerId,
        name: String(b.name).trim(),
        capacity,
        hourlyRate: Number(b.hourlyRate) || 0,
      },
    });
    return NextResponse.json(room);
  } catch (err: any) {
    console.error("POST /api/meeting-rooms failed:", err);
    return NextResponse.json({ error: err?.message || "create failed", code: err?.code }, { status: 500 });
  }
}
