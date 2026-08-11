// Server-side role resolution against the AppRole table.
//
// Kept OUT of src/lib/rbac.ts deliberately: rbac.ts is imported by client
// components (Shell.tsx builds the sidebar from it), so it must stay free of
// Prisma. This module is server-only and layers database roles on top.
//
// Resolution order for a user:
//   1. User.allowedModules  — a per-user override, unchanged behaviour
//   2. AppRole.modules      — the role's configured modules
//   3. MODULE_ACCESS        — the hard-coded fallback in rbac.ts
//
// Step 3 matters: if the database is unreachable or a role row is missing, the
// app degrades to exactly the behaviour it had before this table existed rather
// than locking everyone out.

import { prisma } from "./db";
import { MODULE_ACCESS, ALL_MODULES, parseAllowedModules } from "./rbac";

export type RoleRecord = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  modules: string[];
  builtIn: boolean;
  active: boolean;
  userCount?: number;
};

// Short-lived cache: permission checks can run several times per request, and
// this table changes rarely. 30s keeps an admin's edit visible almost at once
// without hammering the database.
let cache: { at: number; roles: Map<string, string[]> } | null = null;
const TTL_MS = 30_000;

export function invalidateRoleCache() {
  cache = null;
}

async function roleModuleMap(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.roles;

  const map = new Map<string, string[]>();
  try {
    const rows = await prisma.appRole.findMany({
      where: { active: true },
      select: { key: true, modules: true },
    });
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.modules);
        if (Array.isArray(parsed)) map.set(r.key, parsed.map(String));
      } catch {
        // A corrupt modules blob falls through to the code default below.
      }
    }
    cache = { at: Date.now(), roles: map };
  } catch {
    // Database unreachable — return an empty map so callers fall back to
    // MODULE_ACCESS rather than denying everything.
    return new Map();
  }
  return map;
}

/** Modules a role can access, database first, code fallback second. */
export async function modulesForRole(role: string): Promise<string[]> {
  const map = await roleModuleMap();
  const fromDb = map.get(role);
  if (fromDb) return fromDb;
  return ALL_MODULES.filter((m) => (MODULE_ACCESS[m] as string[]).includes(role));
}

/** The server-side equivalent of canAccess(), aware of custom roles. */
export async function canAccessAsync(
  role: string | null | undefined,
  mod: string,
  allowedModulesJson?: string | null,
): Promise<boolean> {
  const override = parseAllowedModules(allowedModulesJson);
  if (override && override.length > 0) return override.includes(mod);
  if (!role) return false;
  return (await modulesForRole(role)).includes(mod);
}

/** Every role key that can reach `mod`, database first, code fallback second. */
export async function rolesWithModule(mod: string): Promise<string[]> {
  const map = await roleModuleMap();
  if (map.size > 0) {
    return [...map.entries()].filter(([, mods]) => mods.includes(mod)).map(([key]) => key);
  }
  // Database unreachable — fall back to the hard-coded map.
  return ((MODULE_ACCESS[mod] as string[]) ?? []).slice();
}

/**
 * Users who can be assigned work in `mod` at a centre.
 *
 * Derived from module access rather than a hard-coded role list: a custom role
 * created in the roles admin screen (HOUSEKEEPING, say) is a first-class
 * assignee the moment it is granted the module, with no code change. Per-user
 * `allowedModules` overrides are honoured too, so a user granted or denied the
 * module individually appears or disappears accordingly.
 *
 * Centre-less users are included so a small site always has someone to assign to.
 */
export async function assignableUsers(
  mod: string,
  centerId: string,
): Promise<{ id: string; name: string }[]> {
  const roles = await rolesWithModule(mod);

  const rows = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ centerId }, { centerId: null }],
      // Either the role grants the module, or the user has a personal override
      // that might. Overrides are filtered precisely below.
      ...(roles.length ? {} : { allowedModules: { not: null } }),
    },
    select: { id: true, name: true, role: true, allowedModules: true },
    orderBy: { name: "asc" },
  });

  return rows
    .filter((u) => {
      const override = parseAllowedModules(u.allowedModules);
      if (override && override.length > 0) return override.includes(mod);
      return roles.includes(u.role);
    })
    .map((u) => ({ id: u.id, name: u.name }));
}

/** Every role plus how many users hold it — powers the roles admin screen. */
export async function listRoles(): Promise<RoleRecord[]> {
  const [rows, counts] = await Promise.all([
    prisma.appRole.findMany({ orderBy: [{ builtIn: "desc" }, { label: "asc" }] }),
    prisma.user.groupBy({ by: ["role"], _count: true }),
  ]);
  const byRole = new Map(counts.map((c) => [c.role, c._count]));

  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    modules: safeParse(r.modules),
    builtIn: r.builtIn,
    active: r.active,
    userCount: byRole.get(r.key) ?? 0,
  }));
}

// A role key is an identifier stored on User.role, so constrain it hard.
export function normaliseRoleKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function safeParse(v: string): string[] {
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Every staff member who could be given work, whether or not their role
 * currently grants the module.
 *
 * Distinct from `assignableUsers`, which is used for AUTOMATIC assignment and
 * must only ever pick someone who can actually action the task. This one is for
 * a human choosing from a dropdown: they may legitimately want to assign to a
 * caretaker or an employee whose access simply has not been set up yet, so the
 * list is complete and the caller shows a warning instead of hiding the person.
 *
 * CLIENT-role users are excluded — portal tenants are not staff.
 */
export async function assignableCandidates(
  mod: string,
  centerId: string,
): Promise<{ id: string; name: string; role: string; hasAccess: boolean }[]> {
  const roles = await rolesWithModule(mod);

  const rows = await prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      role: { not: "CLIENT" },
      OR: [{ centerId }, { centerId: null }],
    },
    select: { id: true, name: true, role: true, allowedModules: true },
    orderBy: { name: "asc" },
  });

  return rows.map((u) => {
    const override = parseAllowedModules(u.allowedModules);
    const hasAccess =
      override && override.length > 0 ? override.includes(mod) : roles.includes(u.role);
    return { id: u.id, name: u.name, role: u.role, hasAccess };
  });
}
