import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import SpacesClient from "./SpacesClient";

export const dynamic = "force-dynamic";

export default async function OccupancySpacesPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "occupancy", me.allowedModules))) {
    return <div className="card">You don’t have access to the Occupancy module.</div>;
  }

  const [centers, clients] = await Promise.all([
    prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { active: true }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);

  // Manage permission decides whether action buttons are shown.
  const canManage = await canAccessAsync(me.role, "occupancy_manage", me.allowedModules);

  return (
    <SpacesClient
      centers={JSON.parse(JSON.stringify(centers))}
      clients={JSON.parse(JSON.stringify(clients))}
      canManage={canManage}
    />
  );
}
