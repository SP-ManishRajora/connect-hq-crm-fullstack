import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const r = await prisma.repair.create({
    data: {
      centerId: b.centerId,
      category: b.category,
      description: b.description,
      assignedTo: b.assignedTo || "OPS",
      cost: b.cost ? Number(b.cost) : null,
      reportedBy: u.name,
    },
  });
  return NextResponse.json(r);
}
