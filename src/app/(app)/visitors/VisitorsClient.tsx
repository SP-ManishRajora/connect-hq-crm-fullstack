"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VisitorsClient({ initial, leads, centers, preselectLeadId }: any) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(!!preselectLeadId);
  const [form, setForm] = useState<any>({
    name: "",
    phone: "",
    email: "",
    aadhaar: "",
    pan: "",
    leadId: preselectLeadId || "",
    centerId: "",
    tourTaken: false,
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) {
      setShowForm(false);
      setForm({ name: "", phone: "", email: "", aadhaar: "", pan: "", leadId: "", centerId: "", tourTaken: false, notes: "" });
      router.refresh();
    }
  }

  async function verify(id: string) {
    const r = await fetch(`/api/visitors/${id}/kyc`, { method: "POST" });
    if (r.ok) router.refresh();
    else alert("KYC verification failed");
  }

  const backLead = preselectLeadId ? leads.find((l: any) => l.id === preselectLeadId) : null;

  return (
    <div className="space-y-4">
      {preselectLeadId && (
        <Link href={`/leads/${preselectLeadId}`} className="text-sm text-brand-600">
          ← Back to lead{backLead ? `: ${backLead.name}` : ""}
        </Link>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Visitors / KYC</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ Register Visitor</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><label className="label">Link to Lead</label>
            <select className="input" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">— Walk-in / not linked —</option>
              {leads.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.phone || l.email})</option>)}
            </select>
          </div>
          <div><label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div><label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div><label className="label">Aadhaar</label>
            <input className="input" value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} placeholder="XXXX-XXXX-XXXX" />
          </div>
          <div><label className="label">PAN</label>
            <input className="input" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
          </div>
          <div><label className="label">Center</label>
            <select className="input" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="tour" type="checkbox" checked={form.tourTaken} onChange={(e) => setForm({ ...form, tourTaken: e.target.checked })} />
            <label htmlFor="tour" className="text-sm">Tour taken</label>
          </div>
          <div className="sm:col-span-2"><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary">Save Visitor</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Aadhaar/PAN</th><th>Lead</th><th>Center</th><th>Tour</th><th>KYC</th><th></th></tr></thead>
            <tbody>
              {initial.map((v: any) => (
                <tr key={v.id}>
                  <td className="font-medium">{v.name}</td>
                  <td>{v.phone}</td>
                  <td className="text-xs">{v.aadhaar}<br />{v.pan}</td>
                  <td>{v.lead?.name || "—"}</td>
                  <td>{v.center?.name || "—"}</td>
                  <td>{v.tourTaken ? "✅" : "—"}</td>
                  <td>{v.kycVerified ? <span className="badge bg-emerald-100 text-emerald-700">Verified</span> : <span className="badge bg-amber-100 text-amber-700">Pending</span>}</td>
                  <td>
                    {!v.kycVerified && (
                      <button className="btn-ghost text-xs" onClick={() => verify(v.id)}>Verify via DigiLocker</button>
                    )}
                  </td>
                </tr>
              ))}
              {initial.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No visitors</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
