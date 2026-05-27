import { prisma } from "@/lib/db";
import ProposalsClient from "./ProposalsClient";
import { RATE_THRESHOLD } from "@/lib/utils";
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { leadId?: string } }) {
  const [proposals, leads, centers] = await Promise.all([
    prisma.proposal.findMany({ orderBy: { createdAt: "desc" }, include: { lead: true, center: true, cabin: true, createdBy: true, approvedBy: true } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.center.findMany({ include: { cabins: true } }),
  ]);
  return (
    <ProposalsClient
      initial={JSON.parse(JSON.stringify(proposals))}
      leads={JSON.parse(JSON.stringify(leads))}
      centers={JSON.parse(JSON.stringify(centers))}
      preselectLeadId={searchParams.leadId || ""}
      threshold={RATE_THRESHOLD}
    />
  );
}
