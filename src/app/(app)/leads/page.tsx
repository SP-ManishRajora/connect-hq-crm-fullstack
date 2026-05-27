import { prisma } from "@/lib/db";
import LeadsClient from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, centers] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { center: true, owner: true, _count: { select: { comments: true } } },
    }),
    prisma.center.findMany(),
  ]);
  return <LeadsClient initialLeads={JSON.parse(JSON.stringify(leads))} centers={JSON.parse(JSON.stringify(centers))} />;
}
