import { prisma } from "@/lib/db";
import ProcurementClient from "./ProcurementClient";
import { getSessionUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  const [prs, pos, vendors, centers] = await Promise.all([
    prisma.purchaseRequest.findMany({ orderBy: { createdAt: "desc" }, include: { center: true, raisedBy: true } }),
    prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, include: { vendor: true, center: true, issuedBy: true } }),
    prisma.vendor.findMany({ where: { active: true } }),
    prisma.center.findMany(),
  ]);
  return (
    <ProcurementClient
      prs={JSON.parse(JSON.stringify(prs))}
      pos={JSON.parse(JSON.stringify(pos))}
      vendors={JSON.parse(JSON.stringify(vendors))}
      centers={JSON.parse(JSON.stringify(centers))}
      role={me?.role || ""}
    />
  );
}
