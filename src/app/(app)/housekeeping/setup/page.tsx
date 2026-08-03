import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import SetupClient from "./SetupClient";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_admin", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const centers = await prisma.center.findMany({
    where: { active: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">🔳 Housekeeping Setup</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Create a centre first — inspection areas belong to a centre.
        </div>
      </div>
    );
  }

  const centerId = searchParams.centerId || centers[0].id;

  const locations = await prisma.inspectionLocation.findMany({
    where: { centerId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      center: { select: { id: true, name: true } },
      qrCodes: {
        where: { active: true },
        select: { id: true, code: true, version: true },
        take: 1,
      },
    },
  });

  return (
    <SetupClient
      centers={centers}
      initial={JSON.parse(JSON.stringify(locations))}
      initialCenterId={centerId}
    />
  );
}
