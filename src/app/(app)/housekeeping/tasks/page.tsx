import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/housekeeping/storage";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

// The assignee-facing counterpart to /housekeeping/issues: only my work, ordered
// by urgency, with the before image and the after-upload inline.
export default async function TasksPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_issues", me.allowedModules))) redirect("/dashboard");

  const issues = await prisma.hkIssue.findMany({
    where: {
      assigneeId: me.id,
      status: { notIn: ["CLOSED", "CANCELLED"] },
    },
    orderBy: [{ severity: "asc" }, { dueAt: "asc" }],
    include: {
      center: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      actions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const withUrls = issues.map((i) => ({
    ...i,
    beforePhotoUrl: i.beforePhotoId ? photoUrl(i.beforePhotoId) : null,
    // The after-photo has to come from the server too: the client's local
    // preview is lost on reload, so without this an uploaded photo vanishes
    // from the card the moment the list refreshes.
    afterPhotoUrl: i.actions[0]?.afterPhotoId ? photoUrl(i.actions[0].afterPhotoId) : null,
  }));

  return <TasksClient initial={JSON.parse(JSON.stringify(withUrls))} />;
}
