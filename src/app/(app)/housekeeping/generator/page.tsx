import { getSessionUser } from "@/lib/auth";
import { parseAllowedModules } from "@/lib/rbac";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { openRun } from "@/lib/housekeeping/generator-service";
import GeneratorClient from "./GeneratorClient";

export const dynamic = "force-dynamic";

export default async function GeneratorPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const mods = parseAllowedModules(me.allowedModules);
  if (!(await canAccessAsync(me.role, "hk_generator", me.allowedModules))) redirect("/dashboard");

  const wide = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: { active: true, ...(wide ? {} : me.centerId ? { id: me.centerId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">⚡ Generator Monitoring</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are not assigned to a centre yet.
        </div>
      </div>
    );
  }

  const centerId = searchParams.centerId || centers[0].id;

  const [rows, discrepancies] = await Promise.all([
    prisma.generator.findMany({
      where: { centerId, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        center: { select: { id: true, name: true } },
        _count: { select: { discrepancies: { where: { resolvedAt: null } } } },
      },
    }),
    prisma.generatorDiscrepancy.findMany({
      where: { centerId, resolvedAt: null },
      orderBy: { detectedAt: "desc" },
      take: 50,
      include: { generator: { select: { id: true, name: true, code: true } } },
    }),
  ]);

  // Annotate live running state so the operator sees it without a second call.
  const gens = await Promise.all(
    rows.map(async (g) => {
      const run = await openRun(g.id);
      const lastReading = await prisma.generatorReading.findFirst({
        where: { generatorId: g.id },
        orderBy: { at: "desc" },
        select: { at: true, fuelReading: true, hourMeter: true },
      });
      return {
        ...g,
        running: Boolean(run),
        runningSince: run?.atServer ?? null,
        lastReading,
      };
    }),
  );

  return (
    <GeneratorClient
      centers={centers}
      initial={JSON.parse(JSON.stringify(gens))}
      discrepancies={JSON.parse(JSON.stringify(discrepancies))}
      initialCenterId={centerId}
      canAdmin={await canAccessAsync(me.role, "hk_admin", me.allowedModules)}
    />
  );
}
