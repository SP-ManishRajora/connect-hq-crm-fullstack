import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import ClientPortal from "./ClientPortal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  // Find the client record via email
  const client = await prisma.client.findFirst({ where: { email: u.email }, include: { center: true } });
  const tickets = client ? await prisma.ticket.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } }) : [];
  const notices = await prisma.notice.findMany({
    where: { OR: [{ centerId: client?.centerId }, { centerId: null }] },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const invoices = client ? await prisma.clientInvoice.findMany({ where: { clientId: client.id }, orderBy: { issuedAt: "desc" }, take: 12 }) : [];

  return <ClientPortal user={u} client={JSON.parse(JSON.stringify(client))} tickets={JSON.parse(JSON.stringify(tickets))} notices={JSON.parse(JSON.stringify(notices))} invoices={JSON.parse(JSON.stringify(invoices))} />;
}
