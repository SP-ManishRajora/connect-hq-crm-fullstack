import { prisma } from "@/lib/db";
import LeadsClient from "./LeadsClient";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const [leads, centers, partners] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { center: true, owner: true },
    }),
    prisma.center.findMany(),
    prisma.partner.findMany({ orderBy: { organisation: "asc" }, include: { contacts: { orderBy: { name: "asc" } } } }),
  ]);
  return (
    <LeadsClient
      initialLeads={JSON.parse(JSON.stringify(leads))}
      centers={JSON.parse(JSON.stringify(centers))}
      partners={JSON.parse(JSON.stringify(partners))}
    />
  );
}
