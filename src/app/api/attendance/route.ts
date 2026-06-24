import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const log = await prisma.attendanceLog.create({
    data: {
      centerId: b.centerId,
      reportedById: u.id,
      cleanliness: b.cleanliness || "OK",
      issuesNote: b.issuesNote || null,
    },
  });
  if (b.cleanliness === "ISSUE") {
    await sendMail("ops@erp.com", `[Daily Update] Issue at center ${b.centerId}`, b.issuesNote || "Issue reported");
  }
  return NextResponse.json(log);
}
