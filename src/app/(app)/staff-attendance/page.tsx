import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import StaffAttendanceClient from "./StaffAttendanceClient";

export const dynamic = "force-dynamic";

function dateOnly(input: string) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function Page({ searchParams }: { searchParams: { date?: string; centerId?: string } }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!requireRole(me.role, ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"])) {
    return <div className="p-6 text-rose-700">You do not have access to staff attendance.</div>;
  }

  const selectedDate = dateOnly(searchParams.date || new Date().toISOString());
  const centerId = searchParams.centerId || "";

  const [users, records, centers] = await Promise.all([
    prisma.user.findMany({
      where: {
        active: true,
        role: { not: "CLIENT" },
        ...(centerId ? { centerId } : {}),
      },
      orderBy: { name: "asc" },
      include: { center: true },
    }),
    prisma.staffAttendance.findMany({
      where: { date: selectedDate, ...(centerId ? { centerId } : {}) },
    }),
    prisma.center.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <StaffAttendanceClient
      users={JSON.parse(JSON.stringify(users))}
      records={JSON.parse(JSON.stringify(records))}
      centers={JSON.parse(JSON.stringify(centers))}
      selectedDate={selectedDate.toISOString().slice(0, 10)}
      selectedCenterId={centerId}
    />
  );
}
