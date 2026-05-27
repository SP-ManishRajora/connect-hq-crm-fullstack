import { prisma } from "@/lib/db";
import ClientsClient from "./ClientsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [clients, acceptedProposals, centers] = await Promise.all([
    prisma.client.findMany({ orderBy: { createdAt: "desc" }, include: { center: true, proposal: true, contract: true } }),
    prisma.proposal.findMany({ where: { status: "ACCEPTED", client: null }, include: { lead: true, center: true } }),
    prisma.center.findMany(),
  ]);
  return (
    <ClientsClient
      initial={JSON.parse(JSON.stringify(clients))}
      acceptedProposals={JSON.parse(JSON.stringify(acceptedProposals))}
      centers={JSON.parse(JSON.stringify(centers))}
    />
  );
}
