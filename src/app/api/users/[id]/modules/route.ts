import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole, ALL_MODULES } from "@/lib/rbac";

// PATCH body: { allowedModules: string[] | null }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  const b = await req.json();
  let modules: string[] | null = null;
  if (Array.isArray(b.allowedModules)) {
    modules = b.allowedModules.filter((m: string) => ALL_MODULES.includes(m));
  }
  const u = await prisma.user.update({
    where: { id: params.id },
    data: { allowedModules: modules ? JSON.stringify(modules) : null },
  });
  return NextResponse.json({ id: u.id, allowedModules: modules });
}
