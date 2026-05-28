import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import MyAttendanceClient from "./MyAttendanceClient";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function Page() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const today = startOfToday();
  const since = new Date(today);
  since.setDate(since.getDate() - 30);

  const [todayRow, history] = await Promise.all([
    prisma.staffAttendance.findUnique({
      where: { userId_date: { userId: me.id, date: today } },
      include: { center: true },
    }),
    prisma.staffAttendance.findMany({
      where: { userId: me.id, date: { gte: since } },
      orderBy: { date: "desc" },
      include: { center: true },
    }),
  ]);

  return (
    <MyAttendanceClient
      todayRow={todayRow ? JSON.parse(JSON.stringify(todayRow)) : null}
      history={JSON.parse(JSON.stringify(history))}
    />
  );
}
