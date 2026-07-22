import { prisma } from "@/lib/db";
import ClientsClient from "./ClientsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [clients, acceptedProposals, centers, cabins, partners] = await Promise.all([
    prisma.client.findMany({ orderBy: { createdAt: "desc" }, include: { center: true, proposal: true, contract: true, partnerContact: { include: { partner: true } } } }),
    prisma.proposal.findMany({ where: { status: "ACCEPTED", client: null }, include: { lead: true, center: true } }),
    prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.cabin.findMany({ select: { id: true, name: true, centerId: true, capacity: true }, orderBy: { name: "asc" } }),
    prisma.partner.findMany({ orderBy: { organisation: "asc" }, include: { contacts: { orderBy: { name: "asc" } } } }),
  ]);
  return (
    <ClientsClient
      initial={JSON.parse(JSON.stringify(clients))}
      acceptedProposals={JSON.parse(JSON.stringify(acceptedProposals))}
      centers={JSON.parse(JSON.stringify(centers))}
      cabins={JSON.parse(JSON.stringify(cabins))}
      partners={JSON.parse(JSON.stringify(partners))}
    />
  );
}
