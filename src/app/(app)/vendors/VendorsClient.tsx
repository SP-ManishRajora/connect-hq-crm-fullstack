"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CATS = ["TEA_COFFEE", "HOUSEKEEPING", "INTERNET", "FURNITURE", "ELECTRICAL", "PLUMBING", "OTHER"];

export default function VendorsClient({ initial, role }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({ name: "", category: "OTHER", contact: "", email: "", phone: "", gstin: "", panNumber: "", bankDetails: "", rateCardJson: "" });
  const isAdminOrOwner = role === "ADMIN" || role === "OWNER";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { setShow(false); router.refresh(); }
  }
  async function blacklist(id: string, current: boolean) {
    let remarks = "";
    if (!current) {
      remarks = prompt("Reason for blacklisting (will be recorded):") || "";
      if (!remarks) return;
    }
    await fetch(`/api/vendors/${id}/blacklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blacklisted: !current, remarks }) });
    router.refresh();
  }
  async function del(id: string, name: string) {
    if (!confirm(`Delete vendor "${name}" permanently?`)) return;
    const r = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Vendors</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Vendor Onboarding</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">Vendor Onboarding Form</h2>
          <div><label className="label">Vendor Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Category *</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Contact Person</label><input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">GSTIN</label><input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
          <div><label className="label">PAN</label><input className="input" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} /></div>
          <div><label className="label">Bank Details</label><input className="input" value={form.bankDetails} onChange={(e) => setForm({ ...form, bankDetails: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Rate Card JSON</label>
            <textarea className="input font-mono text-xs" rows={3} value={form.rateCardJson} onChange={(e) => setForm({ ...form, rateCardJson: e.target.value })} placeholder='[{"item":"Tea pkt","rate":120}]' />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn-primary">Save Vendor</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Category</th><th>Contact</th><th>GSTIN</th><th>PAN</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {initial.map((v: any) => (
              <tr key={v.id} className={v.blacklisted ? "bg-rose-50" : ""}>
                <td className="font-medium">{v.name}{v.blacklisted && <div className="text-xs text-rose-700">⛔ {v.blacklistRemarks}</div>}</td>
                <td>{v.category}</td>
                <td>{v.contact} · {v.phone}<div className="text-xs text-gray-500">{v.email}</div></td>
                <td>{v.gstin}</td>
                <td>{v.panNumber}</td>
                <td>{v.blacklisted ? <span className="badge bg-rose-100 text-rose-700">Blacklisted</span> : <span className="badge bg-emerald-100 text-emerald-700">Active</span>}</td>
                <td className="space-x-2 text-xs">
                  {isAdminOrOwner && (
                    <>
                      <button className="text-amber-700" onClick={() => blacklist(v.id, v.blacklisted)}>{v.blacklisted ? "Restore" : "Blacklist"}</button>
                      <button className="text-red-600" onClick={() => del(v.id, v.name)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No vendors</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
