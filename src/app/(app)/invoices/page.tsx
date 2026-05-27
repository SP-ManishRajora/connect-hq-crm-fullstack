import { prisma } from "@/lib/db";
import { fmtINR, fmtDate } from "@/lib/utils";
import GenerateBtn from "./GenerateBtn";

export const dynamic = "force-dynamic";

export default async function Page() {
  const invoices = await prisma.clientInvoice.findMany({ orderBy: { issuedAt: "desc" }, include: { client: true, center: true } });
  const totals = invoices.reduce(
    (a, i) => ({
      issued: a.issued + i.totalAmount,
      paid: a.paid + (i.status === "PAID" ? i.totalAmount : 0),
      due: a.due + (i.status !== "PAID" ? i.totalAmount : 0),
    }),
    { issued: 0, paid: 0, due: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="h1">Client Invoices</h1>
          <p className="muted">Auto-generated monthly per active client; emails sent automatically.</p>
        </div>
        <GenerateBtn />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card"><div className="muted text-xs">Total Issued</div><div className="text-2xl font-bold mt-1">{fmtINR(totals.issued)}</div></div>
        <div className="card"><div className="muted text-xs">Paid</div><div className="text-2xl font-bold mt-1 text-emerald-700">{fmtINR(totals.paid)}</div></div>
        <div className="card"><div className="muted text-xs">Outstanding</div><div className="text-2xl font-bold mt-1 text-rose-700">{fmtINR(totals.due)}</div></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Invoice #</th><th>Client</th><th>Center</th><th>Period</th><th>Base</th><th>GST</th><th>Total</th><th>Status</th><th>Email</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="font-mono text-xs">{i.invoiceNo}</td>
                <td>{i.client.companyName}</td>
                <td>{i.center.name}</td>
                <td className="text-xs">{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                <td>{fmtINR(i.baseAmount)}</td>
                <td>{fmtINR(i.gstAmount)}</td>
                <td className="font-semibold">{fmtINR(i.totalAmount)}</td>
                <td>{i.status === "PAID" ? <span className="badge bg-emerald-100 text-emerald-700">Paid</span> : <span className="badge bg-amber-100 text-amber-700">{i.status}</span>}</td>
                <td>{i.emailSent ? "✅" : "—"}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No invoices yet — click Generate to create this month's batch</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted text-xs">Schedule <code>POST /api/invoices/run-monthly</code> on the 1st of each month.</p>
    </div>
  );
}
