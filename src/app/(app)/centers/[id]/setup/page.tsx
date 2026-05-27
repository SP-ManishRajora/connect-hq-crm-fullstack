import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canManageCenter } from "@/lib/center-access";
import SetupClient from "./SetupClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canManageCenter(me, params.id)) return <div className="card">You can't manage this center. Admins, Owners, and the assigned Community Manager only.</div>;

  const [center, cabins, openSeats, inventory, clients] = await Promise.all([
    prisma.center.findUnique({ where: { id: params.id } }),
    prisma.cabin.findMany({ where: { centerId: params.id }, include: { seats: true }, orderBy: { name: "asc" } }),
    prisma.seat.findMany({ where: { centerId: params.id, cabinId: null }, orderBy: { number: "asc" } }),
    prisma.inventoryItem.findMany({ where: { centerId: params.id }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { active: true, OR: [{ centerId: params.id }, { centerId: null }] }, select: { id: true, companyName: true, centerId: true, cabinId: true } }),
  ]);
  if (!center) return notFound();
  return (
    <SetupClient
      center={JSON.parse(JSON.stringify(center))}
      cabins={JSON.parse(JSON.stringify(cabins))}
      openSeats={JSON.parse(JSON.stringify(openSeats))}
      inventory={JSON.parse(JSON.stringify(inventory))}
      clients={JSON.parse(JSON.stringify(clients))}
    />
  );
}
