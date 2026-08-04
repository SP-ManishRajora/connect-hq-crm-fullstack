import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole, ALL_MODULES } from "@/lib/rbac";
import { logAction } from "@/lib/audit";
import { listRoles, normaliseRoleKey, invalidateRoleCache } from "@/lib/roles";

// Role management. ADMIN/OWNER only — this decides who can see what, so it sits
// alongside user management rather than inside any feature module.

async function requireAdmin() {
  const u = await getSessionUser();
  if (!u) return { err: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!requireRole(u.role, ["ADMIN", "OWNER"])) {
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user: u };
}

export async function GET() {
  const { err } = await requireAdmin();
  if (err) return err;

  return NextResponse.json({
    roles: await listRoles(),
    // The full catalogue the editor ticks against.
    allModules: ALL_MODULES,
  });
}

const createSchema = z.object({
  key: z.string().min(2).max(40),
  label: z.string().min(2).max(60),
  description: z.string().max(500).nullish(),
  modules: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const { user, err } = await requireAdmin();
  if (err) return err;

  try {
    const b = createSchema.parse(await req.json());
    const key = normaliseRoleKey(b.key);
    if (!key) {
      return NextResponse.json({ error: "Role key must contain letters or numbers" }, { status: 400 });
    }

    const clash = await prisma.appRole.findUnique({ where: { key } });
    if (clash) {
      return NextResponse.json({ error: `A role with key "${key}" already exists` }, { status: 409 });
    }

    // Silently dropping an unknown module would create a role that looks right
    // but grants nothing, so reject instead.
    const unknown = b.modules.filter((m) => !ALL_MODULES.includes(m));
    if (unknown.length) {
      return NextResponse.json({ error: `Unknown modules: ${unknown.join(", ")}` }, { status: 400 });
    }

    const row = await prisma.appRole.create({
      data: {
        key,
        label: b.label.trim(),
        description: b.description ?? null,
        modules: JSON.stringify(b.modules),
        builtIn: false,
      },
    });
    invalidateRoleCache();

    await logAction({
      userId: user!.id,
      action: "ROLE_CREATED",
      targetType: "AppRole",
      targetId: row.id,
      meta: { key, label: row.label, modules: b.modules },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json(
        { error: e.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400 },
      );
    }
    console.error("role create failed:", e);
    return NextResponse.json({ error: "Could not create the role" }, { status: 500 });
  }
}
