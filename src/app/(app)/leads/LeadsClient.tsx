"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STATUS = ["NEW", "CONTACTED", "TOUR_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"];
const SOURCE = ["WEB_FORM", "CALL", "WHATSAPP", "WALK_IN", "REFERRAL"];

const statusColor: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  TOUR_SCHEDULED: "bg-indigo-100 text-indigo-700",
  PROPOSAL_SENT: "bg-amber-100 text-amber-700",
  NEGOTIATION: "bg-purple-100 text-purple-700",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-rose-100 text-rose-700",
};

export default function LeadsClient({ initialLeads, centers }: any) {
  const router = useRouter();
  const [leads] = useState<any[]>(initialLeads);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<any>({ source: "CALL", name: "", phone: "", email: "", company: "", seatsNeeded: "", budget: "", centerId: "", notes: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ source: "CALL", name: "", phone: "", email: "", company: "", seatsNeeded: "", budget: "", centerId: "", notes: "" });
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      console.error("Lead save failed:", res.status, detail);
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  const filtered = leads.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return [l.name, l.phone, l.email, l.company].some((x) => (x || "").toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">CRM / Leads</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Lead</button>
      </div>

      <div className="muted">
        Public web form leads land here automatically: <code className="bg-gray-100 px-1 rounded">/lead-form</code>. WhatsApp/call comments can be added per-lead.
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Source</label>
            <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCE.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div><label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div><label className="label">Company</label>
            <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div><label className="label">Center</label>
            <select className="input" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
              <option value="">— Any —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Seats needed</label>
            <input className="input" type="number" value={form.seatsNeeded} onChange={(e) => setForm({ ...form, seatsNeeded: e.target.value })} />
          </div>
          <div><label className="label">Budget (₹)</label>
            <input className="input" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <div className="sm:col-span-2"><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary">Save Lead</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          <input placeholder="Search name/phone/email/company" className="input max-w-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Source</th><th>Contact</th><th>Center</th><th>Seats</th><th>Status</th><th>Comments</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}<div className="text-xs text-gray-500">{l.company}</div></td>
                  <td><span className="badge bg-gray-100 text-gray-700">{l.source}</span></td>
                  <td className="text-xs">{l.phone}<br />{l.email}</td>
                  <td>{l.center?.name || "—"}</td>
                  <td>{l.seatsNeeded || "—"}</td>
                  <td><span className={`badge ${statusColor[l.status] || "bg-gray-100"}`}>{l.status}</span></td>
                  <td>{l._count.comments}</td>
                  <td><Link href={`/leads/${l.id}`} className="text-brand-600 text-sm">Open →</Link></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">No leads</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
