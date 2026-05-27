import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const b = await req.json();
  const v = await prisma.vendor.update({
    where: { id: params.id },
    data: {
      blacklisted: !!b.blacklisted,
      blacklistRemarks: b.blacklisted ? b.remarks : null,
    },
  });
  return NextResponse.json(v);
}
