import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER", "CENTER_MANAGER"])) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const b = await req.json();
  const c = await prisma.repairCategory.create({ data: { name: b.name } });
  return NextResponse.json(c);
}
