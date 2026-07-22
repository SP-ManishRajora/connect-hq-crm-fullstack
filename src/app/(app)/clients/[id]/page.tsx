import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ClientDetail from "./ClientDetail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const c = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      center: true,
      cabin: true,
      contract: true,
      proposal: true,
      employees: true,
      pic: true,
      partnerContact: { include: { partner: true } },
    },
  });
  if (!c) return notFound();

  const me = await getSessionUser();

  const partners = await prisma.partner.findMany({
    orderBy: { organisation: "asc" },
    include: { contacts: { orderBy: { name: "asc" } } },
  });

  // Pending (unused, unexpired) portal invites for the resend/revoke panel.
  const invites = await prisma.clientInvite.findMany({
    where: { employerClientId: params.id, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true, expiresAt: true },
  });

  return (
    <ClientDetail
      client={JSON.parse(JSON.stringify(c))}
      pendingInvites={JSON.parse(JSON.stringify(invites))}
      partners={JSON.parse(JSON.stringify(partners))}
      role={me?.role ?? null}
    />
  );
}
