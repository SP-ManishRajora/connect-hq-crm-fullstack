import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import LeadDetail from "./LeadDetail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      center: true,
      partnerContact: { include: { partner: true } },
      comments: {
        include: {
          author: true,
          edits: { include: { editor: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      visitors: true,
      proposals: true,
    },
  });
  if (!lead) return notFound();
  const [centers, partners] = await Promise.all([
    prisma.center.findMany(),
    prisma.partner.findMany({ orderBy: { organisation: "asc" }, include: { contacts: { orderBy: { name: "asc" } } } }),
  ]);
  return (
    <LeadDetail
      lead={JSON.parse(JSON.stringify(lead))}
      centers={JSON.parse(JSON.stringify(centers))}
      partners={JSON.parse(JSON.stringify(partners))}
    />
  );
}
