import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { logAction } from "@/lib/audit";

// Roles allowed to edit or delete a referral.
const REFERRAL_WRITE_ROLES = ["ADMIN", "OWNER", "SALES"] as const;

// Fields a user is permitted to edit on a referral.
const EDITABLE_FIELDS = ["referrerType", "referrerName", "contact", "prospectName", "prospectPhone", "feeAmount", "notes"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...REFERRAL_WRITE_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to edit referrals" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));

  const before = await prisma.referral.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "referral not found" }, { status: 404 });

  // Only accept known editable fields; coerce feeAmount to a number.
  // referrerName / prospectName are non-null in the schema, so keep them as
  // strings (fall back to the existing value) instead of nulling on blank.
  const NEVER_NULL = new Set(["referrerName", "prospectName"]);
  const data: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in b)) continue;
    if (key === "feeAmount") data[key] = Number(b[key]) || 0;
    else if (NEVER_NULL.has(key)) data[key] = String(b[key] ?? "").trim();
    else data[key] = b[key] === "" ? null : b[key];
  }

  // Effective values after the patch (fall back to what's already stored).
  const effType = String(data.referrerType ?? before.referrerType ?? "");
  const effReferrerName = "referrerName" in data ? String(data.referrerName) : before.referrerName;
  const effProspectName = "prospectName" in data ? String(data.prospectName) : before.prospectName;

  // Prospect name is always required. Referrer name is required for BROKER
  // referrals; for CLIENT referrals it can come from the linked client.
  if (!effProspectName.trim()) {
    return NextResponse.json({ error: "Prospect name is required" }, { status: 400 });
  }
  if (effType === "BROKER" && !effReferrerName.trim()) {
    return NextResponse.json({ error: "Referrer name is required" }, { status: 400 });
  }

  const referral = await prisma.referral.update({ where: { id: params.id }, data });

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(data)) {
    const beforeVal = (before as Record<string, unknown>)[key];
    const afterVal = (referral as Record<string, unknown>)[key];
    if (beforeVal !== afterVal) changed[key] = { from: beforeVal, to: afterVal };
  }
  await logAction({
    userId: u.id,
    action: "REFERRAL_UPDATED",
    targetType: "Referral",
    targetId: params.id,
    meta: { changed },
  });
  return NextResponse.json(referral);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!requireRole(u.role, [...REFERRAL_WRITE_ROLES])) {
    return NextResponse.json({ error: "You do not have permission to delete referrals" }, { status: 403 });
  }

  // Snapshot the full referral before removal so the deletion stays fully auditable.
  const existing = await prisma.referral.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "referral not found" }, { status: 404 });

  await prisma.referral.delete({ where: { id: params.id } });
  await logAction({
    userId: u.id,
    action: "REFERRAL_DELETED",
    targetType: "Referral",
    targetId: params.id,
    meta: { snapshot: existing },
  });
  return NextResponse.json({ ok: true });
}
