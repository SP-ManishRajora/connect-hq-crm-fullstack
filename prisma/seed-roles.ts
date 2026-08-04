// Seeds AppRole from the hard-coded MODULE_ACCESS table in src/lib/rbac.ts, so
// the database starts as an exact mirror of current behaviour — nobody's access
// changes on the day this ships.
//
// Also adopts any role already present in the User table that rbac.ts never knew
// about (EMPLOYEE was found in live data, resolving to NO access at all). Those
// are created inactive-safe with an empty module list so an admin can see them
// and decide, rather than the system silently granting or denying.
//
//   npx tsx prisma/seed-roles.ts     (idempotent)

import { PrismaClient } from "@prisma/client";
import { MODULE_ACCESS, ALL_MODULES } from "../src/lib/rbac";

const prisma = new PrismaClient();

const LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  OWNER: "Owner",
  MANAGER: "Manager",
  SALES: "Sales",
  OPS: "Operations",
  CENTER_MANAGER: "Centre Manager",
  ACCOUNTS: "Accounts",
  IT: "IT",
  CLIENT: "Client",
};

const DESCRIPTIONS: Record<string, string> = {
  ADMIN: "Full access to every module, including cashflow and audit logs.",
  OWNER: "Full operational access across all centres.",
  MANAGER: "Cross-centre oversight of sales, operations and reporting.",
  SALES: "Leads, proposals, clients and referrals.",
  OPS: "Day-to-day operations, procurement, repairs and housekeeping.",
  CENTER_MANAGER: "Runs one centre — full housekeeping, occupancy and local operations.",
  ACCOUNTS: "Invoicing, ledger, contracts and vendor payments.",
  IT: "Tickets, repairs and SOPs.",
  CLIENT: "Client portal only.",
};

function modulesFor(role: string): string[] {
  return ALL_MODULES.filter((m) => (MODULE_ACCESS[m] as string[]).includes(role));
}

async function main() {
  const builtIns = Object.keys(LABELS);
  let created = 0, refreshed = 0;

  for (const key of builtIns) {
    const modules = modulesFor(key);
    const existing = await prisma.appRole.findUnique({ where: { key } });

    if (existing) {
      // Only re-sync a built-in that an admin has NOT customised, so re-running
      // the seed never silently reverts someone's deliberate change.
      const unchanged = existing.modules === JSON.stringify(modulesFor(key));
      if (unchanged) refreshed++;
      continue;
    }

    await prisma.appRole.create({
      data: {
        key,
        label: LABELS[key],
        description: DESCRIPTIONS[key] ?? null,
        modules: JSON.stringify(modules),
        builtIn: true,
      },
    });
    created++;
  }
  console.log(`Built-in roles — created: ${created}, already present: ${refreshed}`);

  // Adopt orphans: roles users already hold that have no definition anywhere.
  const inUse = await prisma.user.groupBy({ by: ["role"], _count: true });
  let adopted = 0;
  for (const r of inUse) {
    if (!r.role || builtIns.includes(r.role)) continue;
    const exists = await prisma.appRole.findUnique({ where: { key: r.role } });
    if (exists) continue;

    await prisma.appRole.create({
      data: {
        key: r.role,
        label: r.role.charAt(0) + r.role.slice(1).toLowerCase().replace(/_/g, " "),
        description:
          `Adopted automatically — ${r._count} user(s) already held this role but it had no ` +
          `definition, so they had no module access. Assign modules to fix that.`,
        modules: "[]",
        builtIn: false,
      },
    });
    console.log(`  Adopted orphan role "${r.role}" (${r._count} user(s)) — currently NO modules`);
    adopted++;
  }
  if (adopted === 0) console.log("No orphan roles found.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
