import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function OccupancyReportsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "occupancy_reports", me.allowedModules))) {
    return <div className="card">You don’t have access to occupancy reports.</div>;
  }
  const centers = await prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <ReportsClient centers={JSON.parse(JSON.stringify(centers))} />;
}
