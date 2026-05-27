import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import LeadDetail from "./LeadDetail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: { center: true, comments: { include: { author: true }, orderBy: { createdAt: "desc" } }, visitors: true, proposals: true },
  });
  if (!lead) return notFound();
  const centers = await prisma.center.findMany();
  return <LeadDetail lead={JSON.parse(JSON.stringify(lead))} centers={JSON.parse(JSON.stringify(centers))} />;
}
