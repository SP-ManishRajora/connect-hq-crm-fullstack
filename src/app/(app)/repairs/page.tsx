import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import RepairsClient from "./RepairsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await getSessionUser();
  const [repairs, categories, centers] = await Promise.all([
    prisma.repair.findMany({ orderBy: { createdAt: "desc" }, include: { center: true } }),
    prisma.repairCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.center.findMany(),
  ]);
  return (
    <RepairsClient
      role={u?.role || ""}
      repairs={JSON.parse(JSON.stringify(repairs))}
      categories={JSON.parse(JSON.stringify(categories))}
      centers={JSON.parse(JSON.stringify(centers))}
    />
  );
}
