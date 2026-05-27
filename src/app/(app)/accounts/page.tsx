import { prisma } from "@/lib/db";
import AccountsClient from "./AccountsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [expenses, ledger, invoices, centers] = await Promise.all([
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 100, include: { center: true } }),
    prisma.ledgerEntry.findMany({ orderBy: { date: "desc" }, take: 100 }),
    prisma.clientInvoice.findMany({ include: { client: true, center: true } }),
    prisma.center.findMany(),
  ]);
  return (
    <AccountsClient
      expenses={JSON.parse(JSON.stringify(expenses))}
      ledger={JSON.parse(JSON.stringify(ledger))}
      invoices={JSON.parse(JSON.stringify(invoices))}
      centers={JSON.parse(JSON.stringify(centers))}
    />
  );
}
