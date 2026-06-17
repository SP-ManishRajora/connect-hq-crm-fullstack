import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !["ADMIN", "OWNER"].includes(u.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || undefined;
  const targetType = searchParams.get("targetType") || undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true, email: true } } },
  });

  return NextResponse.json(logs);
}
