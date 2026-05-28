import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

function dateOnly(input: string | Date) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysInRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) {
    return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  }
  try {
    const { decision, notes } = await req.json();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
    }

    const lr = await prisma.leaveRequest.findUnique({ where: { id: params.id } });
    if (!lr) return NextResponse.json({ error: "leave request not found" }, { status: 404 });
    if (lr.status !== "PENDING") {
      return NextResponse.json({ error: `already ${lr.status.toLowerCase()}` }, { status: 400 });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: lr.id },
      data: { status: decision, decidedById: me.id, decidedAt: new Date(), notes: notes || null },
    });

    // On approval, write LEAVE status into StaffAttendance for each day in range.
    if (decision === "APPROVED") {
      const days = daysInRange(dateOnly(lr.startDate), dateOnly(lr.endDate));
      const user = await prisma.user.findUnique({ where: { id: lr.userId } });
      for (const d of days) {
        await prisma.staffAttendance.upsert({
          where: { userId_date: { userId: lr.userId, date: d } },
          update: { status: "LEAVE", notes: `Leave (${lr.type})` },
          create: {
            userId: lr.userId,
            date: d,
            status: "LEAVE",
            notes: `Leave (${lr.type})`,
            centerId: user?.centerId || null,
          },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("POST /api/leave-requests/[id]/decide failed:", err);
    return NextResponse.json({ error: err?.message || "internal error", code: err?.code }, { status: 500 });
  }
}
