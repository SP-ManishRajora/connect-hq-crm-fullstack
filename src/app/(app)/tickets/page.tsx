import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import TicketBtns from "./TicketBtns";

export const dynamic = "force-dynamic";

export default async function Page() {
  const tickets = await prisma.ticket.findMany({ orderBy: { createdAt: "desc" }, include: { client: true, raisedBy: true } });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Tickets / Complaints / Feedback</h1>
        <p className="muted">Raised via QR code, client portal, or by staff.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Client</th><th>Category</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.createdAt)}</td>
                <td>{t.client?.companyName || t.raisedBy?.name || "—"}</td>
                <td><span className="badge bg-gray-100 text-gray-700">{t.category}</span></td>
                <td>{t.subject}<div className="text-xs text-gray-500">{t.body}</div></td>
                <td>{t.status === "RESOLVED" ? <span className="badge bg-emerald-100 text-emerald-700">Resolved</span> : <span className="badge bg-amber-100 text-amber-700">{t.status}</span>}</td>
                <td><TicketBtns id={t.id} status={t.status} /></td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No tickets</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
