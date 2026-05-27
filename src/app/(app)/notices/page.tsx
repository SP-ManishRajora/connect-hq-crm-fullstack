import { prisma } from "@/lib/db";
import NoticesClient from "./NoticesClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [notices, centers] = await Promise.all([
    prisma.notice.findMany({ orderBy: { createdAt: "desc" }, include: { center: true } }),
    prisma.center.findMany(),
  ]);
  return <NoticesClient initial={JSON.parse(JSON.stringify(notices))} centers={JSON.parse(JSON.stringify(centers))} />;
}
