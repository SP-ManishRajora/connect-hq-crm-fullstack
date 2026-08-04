import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { centerScope } from "@/lib/housekeeping/route-helpers";
import { getRetentionConfig } from "@/lib/housekeeping/settings";
import SecurityClient from "./SecurityClient";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_admin", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const scope = centerScope(me);

  const [rows, retention] = await Promise.all([
    prisma.deviceRegistration.findMany({
      where: scope ? { user: { centerId: scope } } : {},
      orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
      take: 300,
      include: {
        user: {
          select: {
            id: true, name: true, email: true, role: true,
            center: { select: { name: true } },
          },
        },
      },
    }),
    getRetentionConfig(),
  ]);

  const devices = await Promise.all(
    rows.map(async (d) => ({
      ...d,
      visitCount: await prisma.inspectionVisit.count({
        where: { userId: d.userId, deviceId: d.deviceId },
      }),
    })),
  );

  return (
    <SecurityClient
      devices={JSON.parse(JSON.stringify(devices))}
      retention={retention}
    />
  );
}
