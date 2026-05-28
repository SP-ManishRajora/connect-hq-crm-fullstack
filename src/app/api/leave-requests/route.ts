import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

const TYPES = ["CASUAL", "SICK", "PAID", "UNPAID", "OTHER"];

function dateOnly(input: string | Date) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.startDate || !b.endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }
    const start = dateOnly(b.startDate);
    const end = dateOnly(b.endDate);
    if (end < start) {
      return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
    }
    const type = b.type || "CASUAL";
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
    }

    // Admins can file on behalf of another user; others can only file for themselves.
    const isAdmin = requireRole(me.role, ["ADMIN", "OWNER"]);
    const userId = isAdmin && b.userId ? b.userId : me.id;

    const lr = await prisma.leaveRequest.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        type,
        reason: b.reason || null,
      },
    });
    return NextResponse.json(lr);
  } catch (err: any) {
    console.error("POST /api/leave-requests failed:", err);
    return NextResponse.json({ error: err?.message || "internal error", code: err?.code }, { status: 500 });
  }
}
