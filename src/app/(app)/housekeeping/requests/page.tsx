import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import RequestsClient from "./RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_requests", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const wide = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: { active: true, ...(wide ? {} : me.centerId ? { id: me.centerId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">🧼 Cleaning Requests</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are not assigned to a centre yet.
        </div>
      </div>
    );
  }

  const centerId = searchParams.centerId || centers[0].id;

  const [requests, staff] = await Promise.all([
    prisma.cleaningRequest.findMany({
      where: { centerId, status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      take: 200,
      include: {
        center: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        client: { select: { id: true, companyName: true } },
        _count: { select: { photos: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["OPS", "CENTER_MANAGER", "MANAGER"] },
        OR: [{ centerId }, { centerId: null }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <RequestsClient
      initial={JSON.parse(JSON.stringify(requests))}
      staff={staff}
      meId={me.id}
      meRole={me.role}
      centers={centers}
      initialCenterId={centerId}
    />
  );
}
