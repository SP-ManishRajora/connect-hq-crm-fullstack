import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

const EDITABLE_FIELDS = [
  "name",
  "category",
  "contact",
  "email",
  "phone",
  "gstin",
  "panNumber",
  "bankDetails",
  "rateCardJson",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) {
    return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of EDITABLE_FIELDS) {
      if (k in body) data[k] = body[k] === "" ? null : body[k];
    }
    if (data.name !== undefined && !String(data.name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const v = await prisma.vendor.update({ where: { id: params.id }, data });
    return NextResponse.json(v);
  } catch (err: any) {
    console.error("PATCH /api/vendors/[id] failed:", err);
    return NextResponse.json({ error: err?.message || "update failed" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER"])) return NextResponse.json({ error: "Admin/Owner only" }, { status: 403 });
  await prisma.vendor.update({ where: { id: params.id }, data: { active: false, deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
