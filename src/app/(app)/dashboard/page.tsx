import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { fmtINR } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  const [leads, proposals, clients, prs, openTickets, openRepairs, invoices, centers] = await Promise.all([
    prisma.lead.count(),
    prisma.proposal.count(),
    prisma.client.count({ where: { active: true } }),
    prisma.purchaseRequest.count({ where: { status: { not: "CLOSED" } } }),
    prisma.ticket.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.repair.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.clientInvoice.aggregate({ _sum: { totalAmount: true }, where: { status: "PAID" } }),
    prisma.center.findMany({ include: { _count: { select: { clients: { where: { active: true } } } } } }),
  ]);

  const seatTotals = await Promise.all(
    centers.map(async (c) => {
      const occupied = await prisma.seat.count({ where: { centerId: c.id, occupied: true } });
      const total = await prisma.seat.count({ where: { centerId: c.id } });
      return { name: c.name, occupied, total };
    })
  );

  const stats = [
    { label: "Active Leads", value: leads, href: "/leads", color: "bg-blue-50 text-blue-700" },
    { label: "Proposals", value: proposals, href: "/proposals", color: "bg-indigo-50 text-indigo-700" },
    { label: "Active Clients", value: clients, href: "/clients", color: "bg-emerald-50 text-emerald-700" },
    { label: "Open PRs", value: prs, href: "/procurement", color: "bg-amber-50 text-amber-700" },
    { label: "Open Tickets", value: openTickets, href: "/tickets", color: "bg-rose-50 text-rose-700" },
    { label: "Open Repairs", value: openRepairs, href: "/repairs", color: "bg-orange-50 text-orange-700" },
    { label: "Revenue (paid)", value: fmtINR(invoices._sum.totalAmount || 0), href: "/invoices", color: "bg-teal-50 text-teal-700" },
    { label: "Centers", value: centers.length, href: "/centers", color: "bg-purple-50 text-purple-700" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Welcome, {user?.name}</h1>
        <p className="muted">Role: {user?.role}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:shadow-md transition">
            <div className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${s.color}`}>{s.label}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{s.value}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2 className="h2 mb-3">Seat Occupancy by Center</h2>
        <div className="space-y-3">
          {seatTotals.map((s) => {
            const pct = s.total ? Math.round((s.occupied / s.total) * 100) : 0;
            return (
              <div key={s.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-gray-500">{s.occupied}/{s.total} ({pct}%)</span>
                </div>
                <div className="bg-gray-100 h-2 rounded">
                  <div className="bg-brand-600 h-2 rounded" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {seatTotals.length === 0 && <p className="muted">No centers yet.</p>}
        </div>
      </div>
    </div>
  );
}
