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
