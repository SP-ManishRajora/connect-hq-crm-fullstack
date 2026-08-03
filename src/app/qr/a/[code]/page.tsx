import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import ClientRequestForm from "./ClientRequestForm";

export const dynamic = "force-dynamic";

// PUBLIC — no login. Reached by scanning the client QR sticker at an area.
// The code is the only thing that names the centre/floor/area.
export default async function ClientAreaPage({ params }: { params: { code: string } }) {
  const qr = await prisma.clientQrCode.findUnique({
    where: { code: params.code },
    include: {
      location: {
        include: {
          center: { select: { id: true, name: true, city: true } },
          floor: { select: { name: true } },
        },
      },
    },
  });

  if (!qr || !qr.active || !qr.location || qr.location.deletedAt || !qr.location.active) {
    notFound();
  }

  const [types, clients] = await Promise.all([
    prisma.cleaningRequestType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, group: true, slaMinutes: true },
    }),
    prisma.client.findMany({
      where: { centerId: qr.location.center.id },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 500,
    }),
  ]);

  return (
    <ClientRequestForm
      code={params.code}
      area={{
        name: qr.location.name,
        floor: qr.location.floor?.name ?? null,
        category: qr.location.category,
      }}
      centre={{ name: qr.location.center.name, city: qr.location.center.city }}
      types={types}
      clients={clients.map((c) => ({ id: c.id, name: c.companyName }))}
    />
  );
}
