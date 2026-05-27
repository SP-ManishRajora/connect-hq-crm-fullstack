import { prisma } from "@/lib/db";
import AttendanceClient from "./AttendanceClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [logs, centers] = await Promise.all([
    prisma.attendanceLog.findMany({ orderBy: { date: "desc" }, take: 60, include: { center: true, reportedBy: true } }),
    prisma.center.findMany(),
  ]);
  return <AttendanceClient logs={JSON.parse(JSON.stringify(logs))} centers={JSON.parse(JSON.stringify(centers))} />;
}
