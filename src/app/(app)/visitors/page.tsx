import { prisma } from "@/lib/db";
import VisitorsClient from "./VisitorsClient";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { leadId?: string } }) {
  const [visitors, leads, centers] = await Promise.all([
    prisma.visitor.findMany({ orderBy: { createdAt: "desc" }, include: { lead: true, center: true } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.center.findMany(),
  ]);
  return (
    <VisitorsClient
      initial={JSON.parse(JSON.stringify(visitors))}
      leads={JSON.parse(JSON.stringify(leads))}
      centers={JSON.parse(JSON.stringify(centers))}
      preselectLeadId={searchParams.leadId || ""}
    />
  );
}
