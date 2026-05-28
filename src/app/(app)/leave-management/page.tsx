import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import LeaveManagementClient from "./LeaveManagementClient";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { status?: string } }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!requireRole(me.role, ["ADMIN", "OWNER"])) {
    return <div className="p-6 text-rose-700">You do not have access to leave management.</div>;
  }

  const statusFilter = (searchParams.status || "PENDING").toUpperCase();
  const where = statusFilter === "ALL" ? {} : { status: statusFilter };

  const [requests, users] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { user: true, decidedBy: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: { not: "CLIENT" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  return (
    <LeaveManagementClient
      requests={JSON.parse(JSON.stringify(requests))}
      users={JSON.parse(JSON.stringify(users))}
      statusFilter={statusFilter}
    />
  );
}
