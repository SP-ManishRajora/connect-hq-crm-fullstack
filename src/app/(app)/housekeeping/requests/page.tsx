import { getSessionUser } from "@/lib/auth";
import { canAccessAsync, assignableUsers } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import RequestsClient from "./RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { centerId?: string; focus?: string; code?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_requests", me.allowedModules))) redirect("/dashboard");

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

  // Arriving from an area sticker with ?focus=<requestId> and no centreId: load the
  // centre that request actually belongs to, or its row would be missing from the
  // list. Constrained to centres this user may already see, so the focus parameter
  // cannot widen access.
  const allowed = new Set(centers.map((c) => c.id));
  const focused = searchParams.focus
    ? await prisma.cleaningRequest.findUnique({
        where: { id: searchParams.focus },
        select: { id: true, centerId: true },
      })
    : null;
  const focusCenterId = focused && allowed.has(focused.centerId) ? focused.centerId : null;

  const centerId = searchParams.centerId || focusCenterId || centers[0].id;

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
    assignableUsers("hk_requests", centerId),
  ]);

  return (
    <RequestsClient
      initial={JSON.parse(JSON.stringify(requests))}
      staff={staff}
      meId={me.id}
      meRole={me.role}
      centers={centers}
      initialCenterId={centerId}
      // Handed over from the area sticker: open this request and prefill the code
      // that was scanned, so completion is one tap rather than a second hunt.
      focusId={focusCenterId ? focused!.id : null}
      scannedCode={searchParams.code ?? null}
    />
  );
}
