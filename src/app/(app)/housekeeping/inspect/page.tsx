import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import InspectClient from "./InspectClient";

export const dynamic = "force-dynamic";

export default async function InspectPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_inspect", me.allowedModules))) redirect("/dashboard");

  // Centre scoping: ADMIN/OWNER may inspect any centre; everyone else is pinned
  // to their own.
  const wideAccess = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: {
      active: true,
      ...(wideAccess ? {} : me.centerId ? { id: me.centerId } : {}),
    },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
  });

  // Areas this person must re-inspect. Shown before they start so the round
  // covers them, rather than discovering it afterwards.
  const rejected = await prisma.inspectionVisit.findMany({
    where: { userId: me.id, rejectedAt: { not: null } },
    orderBy: { rejectedAt: "desc" },
    take: 10,
    select: {
      id: true, rejectionReason: true, rejectedAt: true,
      location: { select: { name: true } },
      rejectedBy: { select: { name: true } },
    },
  });

  const activeRound = await prisma.inspectionRound.findFirst({
    where: { userId: me.id, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">📸 Inspections</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are not assigned to a centre, so there is nothing to inspect yet. Ask an
          administrator to assign your account to a centre.
        </div>
      </div>
    );
  }

  return (
    <InspectClient
      centers={centers}
      activeRound={activeRound ? JSON.parse(JSON.stringify(activeRound)) : null}
      defaultCenterId={me.centerId ?? centers[0]?.id ?? null}
      rejected={JSON.parse(JSON.stringify(rejected))}
      // Handed over from the area sticker (/qr/a/<code>) when a supervisor chose
      // "Start an inspection" there. Only submitted once a round is open, and only
      // with a fresh GPS fix — the sticker cannot open a visit on its own.
      pendingCode={searchParams.code ?? null}
    />
  );
}
