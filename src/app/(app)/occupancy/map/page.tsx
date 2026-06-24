import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/rbac";
import MapClient from "./MapClient";

export const dynamic = "force-dynamic";

export default async function OccupancyMapPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "occupancy")) {
    return <div className="card">You don’t have access to the Occupancy module.</div>;
  }
  const [centers, clients] = await Promise.all([
    prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { active: true }, select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
  ]);
  return (
    <MapClient
      centers={JSON.parse(JSON.stringify(centers))}
      clients={JSON.parse(JSON.stringify(clients))}
      canManage={canAccess(me.role, "occupancy_manage")}
    />
  );
}
