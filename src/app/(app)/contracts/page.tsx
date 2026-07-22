import { prisma } from "@/lib/db";
import { fmtDate, fmtINR } from "@/lib/utils";
import ContractsClient from "./ContractsClient";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const [contracts, centers] = await Promise.all([
    prisma.contract.findMany({
      orderBy: { revisionDate: "asc" },
      include: { client: { include: { center: true } } },
    }),
    prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
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

      <ContractsClient
        contracts={JSON.parse(JSON.stringify(contracts))}
        centers={JSON.parse(JSON.stringify(centers))}
      />

      <p className="muted text-xs">
        Endpoint <code>POST /api/contracts/run-reminders</code> — schedule via cron daily.
      </p>
    </div>
  );
}
