import { prisma } from "@/lib/db";
import VendorInvoicesClient from "./VendorInvoicesClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [invoices, vendors, pos, centers] = await Promise.all([
    prisma.vendorInvoice.findMany({ orderBy: { createdAt: "desc" }, include: { vendor: true, po: { include: { center: true } } } }),
    prisma.vendor.findMany({ where: { active: true } }),
    prisma.purchaseOrder.findMany({ where: { paymentStatus: { not: "PAID" } }, include: { vendor: true } }),
    prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <VendorInvoicesClient
      initial={JSON.parse(JSON.stringify(invoices))}
      vendors={JSON.parse(JSON.stringify(vendors))}
      pos={JSON.parse(JSON.stringify(pos))}
      centers={JSON.parse(JSON.stringify(centers))}
    />
  );
}
