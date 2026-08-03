import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";

const email = z.string().email();
const schema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["MANAGEMENT", "FACILITY", "ACCOUNTS", "SECURITY", "CENTRE", "CUSTOM"]).default("CUSTOM"),
  centerId: z.string().min(1).nullish(),
  toEmails: z.array(email).min(1, "At least one recipient is required"),
  ccEmails: z.array(email).default([]),
  active: z.boolean().default(true),
});

export async function GET() {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;
  try {
    const rows = await prisma.emailGroup.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      include: { center: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        toEmails: safeList(r.toEmails),
        ccEmails: safeList(r.ccEmails),
      })),
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;
  try {
    const b = parseBody(schema, await req.json());
    if (b.centerId) assertCenterAllowed(u, b.centerId);

    const row = await prisma.emailGroup.create({
      data: {
        name: b.name, kind: b.kind, centerId: b.centerId ?? null,
        toEmails: JSON.stringify(b.toEmails),
        ccEmails: JSON.stringify(b.ccEmails),
        active: b.active,
      },
    });

    await logAction({
      userId: u.id, action: "HK_EMAIL_GROUP_CREATED",
      targetType: "EmailGroup", targetId: row.id,
      meta: { name: row.name, kind: row.kind, recipients: b.toEmails.length },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function safeList(v: string | null): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
}
