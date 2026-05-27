import { prisma } from "@/lib/db";
import { fmtDate, fmtINR } from "@/lib/utils";
import RevisionBtn from "./RevisionBtn";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const contracts = await prisma.contract.findMany({
    orderBy: { revisionDate: "asc" },
    include: { client: { include: { center: true } } },
  });
  const now = new Date();
  const oneMonth = 30 * 24 * 3600 * 1000;
  const dueSoon = contracts.filter((c) => c.revisionDate.getTime() - now.getTime() < oneMonth && c.revisionDate.getTime() > now.getTime() - oneMonth);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Contracts</h1>
        <p className="muted">Auto-reminder runs 1 month before each revision date — emails accounts team.</p>
      </div>

      {dueSoon.length > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <h2 className="h2 text-amber-900">⚠ Revisions due in &lt; 30 days</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {dueSoon.map((c) => (
              <li key={c.id}>
                <strong>{c.client.companyName}</strong> ({c.client.center.name}) —
                {" "}revision {fmtDate(c.revisionDate)}, +{c.incrementPct}% on {fmtINR(c.monthlyRent)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Client</th><th>Center</th><th>Start</th><th>Monthly Rent</th><th>Increment %</th><th>Next Revision</th><th>Reminder</th><th></th></tr></thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.client.companyName}</td>
                <td>{c.client.center.name}</td>
                <td>{fmtDate(c.startDate)}</td>
                <td>{fmtINR(c.monthlyRent)}</td>
                <td>{c.incrementPct}%</td>
                <td>{fmtDate(c.revisionDate)}</td>
                <td>{c.reminderSent ? "✅" : "—"}</td>
                <td><RevisionBtn id={c.id} /></td>
              </tr>
            ))}
            {contracts.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No contracts</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="muted text-xs">
        Endpoint <code>POST /api/contracts/run-reminders</code> — schedule via cron daily.
      </p>
    </div>
  );
}
