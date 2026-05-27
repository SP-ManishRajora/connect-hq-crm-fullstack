import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
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
    },
  });
  if (!c) return notFound();
  return <ClientDetail client={JSON.parse(JSON.stringify(c))} />;
}
