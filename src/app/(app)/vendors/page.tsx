import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import VendorsClient from "./VendorsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  const vendors = await prisma.vendor.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return <VendorsClient initial={JSON.parse(JSON.stringify(vendors))} role={me?.role || ""} />;
}
