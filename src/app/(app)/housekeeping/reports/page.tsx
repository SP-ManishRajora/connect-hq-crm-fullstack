import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { REPORT_TYPES, REPORT_LABELS, isReportType } from "@/lib/housekeeping/reports";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_reports", me.allowedModules))) redirect("/dashboard");

  const wide = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: { active: true, ...(wide ? {} : me.centerId ? { id: me.centerId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const initialType =
    searchParams.type && isReportType(searchParams.type) ? searchParams.type : REPORT_TYPES[0];

  return (
    <ReportsClient
      reports={REPORT_TYPES.map((t) => ({ type: t, label: REPORT_LABELS[t] }))}
      centers={centers}
      initialType={initialType}
    />
  );
}
