import { getSessionUser } from "@/lib/auth";
import { canAccessAsync, assignableUsers } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/housekeeping/storage";
import IssuesClient from "./IssuesClient";

export const dynamic = "force-dynamic";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_issues", me.allowedModules))) redirect("/dashboard");

  const wide = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: { active: true, ...(wide ? {} : me.centerId ? { id: me.centerId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">🚨 Issues &amp; Corrective Actions</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are not assigned to a centre yet.
        </div>
      </div>
    );
  }

  const centerId = searchParams.centerId || centers[0].id;

  const [issues, staff, locations] = await Promise.all([
    prisma.hkIssue.findMany({
      where: { centerId, status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: [{ severity: "asc" }, { dueAt: "asc" }],
      take: 200,
      include: {
        center: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        raisedBy: { select: { id: true, name: true } },
        actions: {
          orderBy: { createdAt: "desc" },
          include: { assignee: { select: { id: true, name: true } } },
        },
        _count: { select: { reinspections: true } },
      },
    }),
    // Candidate assignees: anyone who can actually reach the issues module at
    // this centre. Derived from module access, so custom roles count too.
    assignableUsers("hk_issues", centerId),
    prisma.inspectionLocation.findMany({
      where: { centerId, deletedAt: null, active: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  // Signed URLs are generated server-side; raw file paths never reach the client.
  const withUrls = issues.map((i) => ({
    ...i,
    beforePhotoUrl: i.beforePhotoId ? photoUrl(i.beforePhotoId) : null,
    afterPhotoUrl: i.actions[0]?.afterPhotoId ? photoUrl(i.actions[0].afterPhotoId) : null,
  }));

  return (
    <IssuesClient
      initial={JSON.parse(JSON.stringify(withUrls))}
      centers={centers}
      staff={staff}
      locations={locations}
      initialCenterId={centerId}
      meId={me.id}
      meRole={me.role}
    />
  );
}
