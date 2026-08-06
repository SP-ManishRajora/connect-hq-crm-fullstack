import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { centerScope } from "@/lib/housekeeping/route-helpers";
import AlertsClient from "./AlertsClient";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "housekeeping", me.allowedModules))) redirect("/dashboard");

  const scope = centerScope(me);
  const alerts = await prisma.hkAlert.findMany({
    where: { ...(scope ? { centerId: scope } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      center: { select: { id: true, name: true } },
      ackBy: { select: { id: true, name: true } },
      notifications: {
        select: { channel: true, status: true, sentAt: true, recipients: true, error: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return <AlertsClient initial={JSON.parse(JSON.stringify(alerts))} />;
}
