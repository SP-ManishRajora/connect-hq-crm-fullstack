import { prisma } from "@/lib/db";
import InventoryClient from "./InventoryClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [inventory, assets, centers] = await Promise.all([
    prisma.inventoryItem.findMany({ include: { center: true }, orderBy: { name: "asc" } }),
    prisma.asset.findMany({ include: { center: true }, orderBy: { createdAt: "desc" } }),
    prisma.center.findMany(),
  ]);
  return (
    <InventoryClient
      inventory={JSON.parse(JSON.stringify(inventory))}
      assets={JSON.parse(JSON.stringify(assets))}
      centers={JSON.parse(JSON.stringify(centers))}
    />
  );
}
