"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR } from "@/lib/utils";

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  SENT: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export default function ProposalsClient({ initial, leads, centers, preselectLeadId, threshold }: any) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(!!preselectLeadId);
  const [form, setForm] = useState<any>({
    leadId: preselectLeadId || "",
    centerId: "",
    cabinId: "",
    seats: 5,
    rentPerSeat: 10000,
    securityDeposit: 50000,
    lockInMonths: 12,
    customisations: "",
  });

  const cabins = useMemo(() => {
    const c = centers.find((x: any) => x.id === form.centerId);
    return c?.cabins || [];
  }, [form.centerId, centers]);

  const selectedCabin = cabins.find((c: any) => c.id === form.cabinId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { setShowForm(false); router.refresh(); } else alert("Failed");
  }
  async function approve(id: string, decision: "APPROVE" | "REJECT") {
    await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    router.refresh();
  }
  async function send(id: string) {
    const r = await fetch(`/api/proposals/${id}/send`, { method: "POST" });
    if (r.ok) { alert("Sent (logged to console). Cabin and common area photos attached."); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }
  async function accept(id: string) {
    if (!confirm("Mark proposal as accepted by client?")) return;
    await fetch(`/api/proposals/${id}/accept`, { method: "POST" });
    router.refresh();
  }

  const belowThreshold = Number(form.rentPerSeat) > 0 && Number(form.rentPerSeat) < threshold;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Proposals</h1>
          <p className="muted">Approval threshold: {fmtINR(threshold)} per seat. Cabin + common area photos auto-attach on send.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Proposal</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Lead</label>
            <select className="input" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">— None —</option>
              {leads.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.company})</option>)}
            </select>
          </div>
          <div><label className="label">Center *</label>
            <select className="input" required value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value, cabinId: "" })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Cabin (optional — leave blank for open seats)</label>
            <select className="input" value={form.cabinId} onChange={(e) => setForm({ ...form, cabinId: e.target.value, seats: cabins.find((c: any) => c.id === e.target.value)?.capacity || form.seats })}>
              <option value="">Open / hot-desk seats</option>
              {cabins.map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.capacity} seater</option>)}
            </select>
            {selectedCabin && (
              <div className="flex flex-wrap gap-2 mt-2">
                {(JSON.parse(selectedCabin.photos || "[]") as string[]).map((p, i) => (
                  <img key={i} src={p} className="w-20 h-20 object-cover rounded border" alt="" />
                ))}
              </div>
            )}
          </div>
          <div><label className="label">Seats *</label>
            <input className="input" type="number" required value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
          </div>
          <div><label className="label">Rent / seat (₹) *</label>
            <input className="input" type="number" required value={form.rentPerSeat} onChange={(e) => setForm({ ...form, rentPerSeat: Number(e.target.value) })} />
            {belowThreshold && <p className="text-xs text-amber-700 mt-1">⚠ Below threshold of {fmtINR(threshold)} — manager approval needed.</p>}
          </div>
          <div><label className="label">Security Deposit (₹) *</label>
            <input className="input" type="number" required value={form.securityDeposit} onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })} />
          </div>
          <div><label className="label">Lock-in (months)</label>
            <input className="input" type="number" value={form.lockInMonths} onChange={(e) => setForm({ ...form, lockInMonths: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-2"><label className="label">Customisations</label>
            <textarea className="input" rows={3} value={form.customisations} onChange={(e) => setForm({ ...form, customisations: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary">Save Proposal</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Lead</th><th>Center</th><th>Cabin</th><th>Seats</th><th>Rent/Seat</th><th>SD</th><th>Lock-in</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {initial.map((p: any) => (
              <tr key={p.id}>
                <td>{p.lead?.name || "—"}<div className="text-xs text-gray-500">{p.createdBy?.name}</div></td>
                <td>{p.center?.name}</td>
                <td>{p.cabin?.name || "Open"}</td>
                <td>{p.seats}</td>
                <td>{fmtINR(p.rentPerSeat)}{p.belowThreshold && <span className="ml-1 text-xs text-amber-700">⚠</span>}</td>
                <td>{fmtINR(p.securityDeposit)}</td>
                <td>{p.lockInMonths}m</td>
                <td><span className={`badge ${statusColor[p.status]}`}>{p.status}</span></td>
                <td className="space-x-1">
                  {p.status === "PENDING_APPROVAL" && (
                    <>
                      <button className="btn-ghost text-xs" onClick={() => approve(p.id, "APPROVE")}>Approve</button>
                      <button className="btn-ghost text-xs" onClick={() => approve(p.id, "REJECT")}>Reject</button>
                    </>
                  )}
                  {(p.status === "DRAFT" || p.status === "APPROVED") && <button className="btn-ghost text-xs" onClick={() => send(p.id)}>Send</button>}
                  {p.status === "SENT" && <button className="btn-ghost text-xs" onClick={() => accept(p.id)}>Mark accepted</button>}
                </td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No proposals</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
