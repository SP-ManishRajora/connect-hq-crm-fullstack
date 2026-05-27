import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import CentersClient from "./CentersClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  const centers = await prisma.center.findMany({
    orderBy: { name: "asc" },
    include: {
      cabins: { select: { id: true } },
      _count: { select: { clients: true, leads: true, seats: true } },
    },
  });
  return <CentersClient
    initial={JSON.parse(JSON.stringify(centers))}
    role={me?.role || ""}
    myCenterId={me?.centerId || ""}
  />;
}
