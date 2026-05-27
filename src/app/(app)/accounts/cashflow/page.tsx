import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CashflowPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.role !== "ADMIN") {
    return <div className="card">Admin access only.</div>;
  }
  const centers = await prisma.center.findMany();
  const data = await Promise.all(
    centers.map(async (c) => {
      const inv = await prisma.clientInvoice.findMany({ where: { centerId: c.id } });
      const exp = await prisma.expense.findMany({ where: { centerId: c.id } });
      const inflow = inv.filter((i) => i.status === "PAID").reduce((a, x) => a + x.totalAmount, 0);
      const gst = inv.reduce((a, x) => a + x.gstAmount, 0);
      const outflow = exp.reduce((a, x) => a + x.amount, 0);
      const tds = exp.reduce((a, x) => a + x.tds, 0);
      const expGst = exp.reduce((a, x) => a + x.gst, 0);
      return { id: c.id, name: c.name, inflow, gst, outflow, tds, expGst, net: inflow - outflow };
    })
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="h1">Cashflow per Center (Admin)</h1>
          <p className="muted">Download with TDS, GST, all heads.</p>
        </div>
        <a href="/api/cashflow/csv" className="btn-primary">Download CSV</a>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Center</th><th>Inflow (paid)</th><th>GST collected</th><th>Outflow</th><th>TDS deducted</th><th>GST on expense</th><th>Net</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">{d.name}</td>
                <td>{fmtINR(d.inflow)}</td>
                <td>{fmtINR(d.gst)}</td>
                <td>{fmtINR(d.outflow)}</td>
                <td>{fmtINR(d.tds)}</td>
                <td>{fmtINR(d.expGst)}</td>
                <td className={d.net >= 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>{fmtINR(d.net)}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No centers yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
