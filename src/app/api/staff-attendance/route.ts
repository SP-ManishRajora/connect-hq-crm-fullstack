import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

const ALLOWED_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "HOLIDAY", "ABSENT"];

function dateOnly(input: string | Date) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"])) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  try {
    const b = await req.json();
    if (!b.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (!b.date) return NextResponse.json({ error: "date required" }, { status: 400 });
    const status = b.status || "PRESENT";
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${ALLOWED_STATUSES.join(", ")}` }, { status: 400 });
    }
    const date = dateOnly(b.date);
    const user = await prisma.user.findUnique({ where: { id: b.userId } });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const row = await prisma.staffAttendance.upsert({
      where: { userId_date: { userId: b.userId, date } },
      update: { status, notes: b.notes ?? undefined },
      create: {
        userId: b.userId,
        date,
        status,
        notes: b.notes || null,
        centerId: user.centerId || null,
      },
    });
    return NextResponse.json(row);
  } catch (err: any) {
    console.error("POST /api/staff-attendance failed:", err);
    return NextResponse.json({ error: err?.message || "internal error", code: err?.code }, { status: 500 });
  }
}
