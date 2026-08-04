import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole, ALL_MODULES } from "@/lib/rbac";
import { logAction } from "@/lib/audit";
import { normaliseRoleKey, invalidateRoleCache } from "@/lib/roles";

async function requireAdmin() {
  const u = await getSessionUser();
  if (!u) return { err: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!requireRole(u.role, ["ADMIN", "OWNER"])) {
    return { err: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user: u };
}

const patchSchema = z.object({
  label: z.string().min(2).max(60).optional(),
  description: z.string().max(500).nullish(),
  modules: z.array(z.string()).optional(),
  key: z.string().min(2).max(40).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, err } = await requireAdmin();
  if (err) return err;

  try {
    const b = patchSchema.parse(await req.json());
    const role = await prisma.appRole.findUnique({ where: { id: params.id } });
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

    if (b.modules) {
      const unknown = b.modules.filter((m) => !ALL_MODULES.includes(m));
      if (unknown.length) {
        return NextResponse.json({ error: `Unknown modules: ${unknown.join(", ")}` }, { status: 400 });
      }
    }

    // Removing every module from ADMIN would lock the last administrator out of
    // user management, with no way back through the UI.
    if (role.key === "ADMIN" && b.modules && !b.modules.includes("users")) {
      return NextResponse.json(
        { error: "ADMIN must keep access to Users, or nobody could manage roles again." },
        { status: 400 },
      );
    }

    // Renaming the key means every user holding it must move with it, in the
    // same transaction — otherwise they are stranded on a role that no longer
    // exists, which is the exact bug this feature was built to fix.
    let newKey = role.key;
    let movedUsers = 0;
    if (b.key) {
      const candidate = normaliseRoleKey(b.key);
      if (!candidate) {
        return NextResponse.json({ error: "Role key must contain letters or numbers" }, { status: 400 });
      }
      if (candidate !== role.key) {
        if (role.builtIn) {
          return NextResponse.json(
            { error: "A built-in role's key cannot be changed. You can rename its label." },
            { status: 400 },
          );
        }
        const clash = await prisma.appRole.findUnique({ where: { key: candidate } });
        if (clash) {
          return NextResponse.json({ error: `Key "${candidate}" is already in use` }, { status: 409 });
        }
        newKey = candidate;
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.appRole.update({
        where: { id: role.id },
        data: {
          ...(b.label !== undefined ? { label: b.label.trim() } : {}),
          ...(b.description !== undefined ? { description: b.description } : {}),
          ...(b.modules !== undefined ? { modules: JSON.stringify(b.modules) } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
          ...(newKey !== role.key ? { key: newKey } : {}),
        },
      }),
      ...(newKey !== role.key
        ? [prisma.user.updateMany({ where: { role: role.key }, data: { role: newKey } })]
        : []),
    ]);

    if (newKey !== role.key) {
      movedUsers = await prisma.user.count({ where: { role: newKey } });
    }
    invalidateRoleCache();

    await logAction({
      userId: user!.id,
      action: "ROLE_UPDATED",
      targetType: "AppRole",
      targetId: role.id,
      meta: {
        before: { key: role.key, label: role.label, modules: safe(role.modules), active: role.active },
        after: { key: updated.key, label: updated.label, modules: b.modules ?? safe(role.modules), active: updated.active },
        usersMoved: movedUsers,
      },
    });

    return NextResponse.json({ ...updated, usersMoved: movedUsers });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json(
        { error: e.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        { status: 400 },
      );
    }
    console.error("role update failed:", e);
    return NextResponse.json({ error: "Could not update the role" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, err } = await requireAdmin();
  if (err) return err;

  const role = await prisma.appRole.findUnique({ where: { id: params.id } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (role.builtIn) {
    return NextResponse.json(
      { error: `"${role.label}" is a built-in role and cannot be deleted. You can deactivate it instead.` },
      { status: 400 },
    );
  }

  // The guard that stops a repeat of the EMPLOYEE situation: deleting a role in
  // use would leave those users holding a name nothing recognises, and hence no
  // access at all.
  const inUse = await prisma.user.count({ where: { role: role.key } });
  if (inUse > 0) {
    return NextResponse.json(
      {
        error:
          `${inUse} user${inUse === 1 ? " is" : "s are"} assigned to "${role.label}". ` +
          `Move ${inUse === 1 ? "them" : "them all"} to another role first — otherwise ` +
          `${inUse === 1 ? "they would lose" : "they would all lose"} access entirely.`,
        userCount: inUse,
      },
      { status: 409 },
    );
  }

  await prisma.appRole.delete({ where: { id: role.id } });
  invalidateRoleCache();

  await logAction({
    userId: user!.id,
    action: "ROLE_DELETED",
    targetType: "AppRole",
    targetId: role.id,
    meta: { key: role.key, label: role.label, modules: safe(role.modules) },
  });

  return NextResponse.json({ ok: true });
}

function safe(v: string): string[] {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
