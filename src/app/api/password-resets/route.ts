import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

// GET — Admin/Owner lists pending password resets
export async function GET() {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const list = await prisma.passwordResetRequest.findMany({
    orderBy: { createdAt: "desc" }, take: 50,
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  return NextResponse.json(list);
}
