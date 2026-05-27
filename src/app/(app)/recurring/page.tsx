import { prisma } from "@/lib/db";
import { fmtINR, fmtDate } from "@/lib/utils";
import RegenBtn from "./RegenBtn";

export const dynamic = "force-dynamic";

export default async function Page() {
  const recurring = await prisma.purchaseOrder.findMany({
    where: { isRecurring: true },
    orderBy: { createdAt: "desc" },
    include: { vendor: true, center: true },
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="h1">Recurring Purchase Orders</h1>
          <p className="muted">Tea/coffee, housekeeping, internet — auto-regenerated for next cycle.</p>
        </div>
        <RegenBtn />
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Vendor</th><th>Center</th><th>Category</th><th>Cycle</th><th>Amount</th><th>Last Issued</th></tr></thead>
          <tbody>
            {recurring.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.vendor.name}</td>
                <td>{p.center.name}</td>
                <td><span className="badge bg-blue-100 text-blue-700">{p.category}</span></td>
                <td>{p.recurrence}</td>
                <td>{fmtINR(p.totalAmount)}</td>
                <td>{fmtDate(p.createdAt)}</td>
              </tr>
            ))}
            {recurring.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No recurring POs</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted text-xs">
        Schedule <code>POST /api/po/run-recurring</code> daily — clones MONTHLY POs older than 30 days.
      </p>
    </div>
  );
}
