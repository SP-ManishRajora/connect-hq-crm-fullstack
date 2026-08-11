import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/housekeeping/storage";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

// The assignee-facing counterpart to /housekeeping/issues: only my work, ordered
// by urgency, with the before image and the after-upload inline.
//
// Access rule is deliberately NOT the hk_issues module. Work can be assigned to
// anyone — a caretaker, an accounts clerk covering a shift — and a task nobody
// can open is a task nobody does. So: you may always see your OWN assigned work.
// The page shows only `assigneeId: me.id`, so this exposes nothing else.
export default async function TasksPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

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

  // Someone with neither module access nor any assigned work has no business
  // here — send them home rather than showing an empty page.
  if (issues.length === 0 && !(await canAccessAsync(me.role, "hk_issues", me.allowedModules))) {
    redirect("/dashboard");
  }

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
