"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

export default function ReferralsClient({ initial, clients }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [r, setR] = useState<any>({ referrerType: "CLIENT", referrerId: "", referrerName: "", contact: "", prospectName: "", prospectPhone: "", feeAmount: 0, notes: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    if (res.ok) { setShow(false); router.refresh(); }
  }
  async function markPaid(id: string) {
    await fetch(`/api/referrals/${id}/pay`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Referrals (Clients & Brokers)</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ New Referral</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Referrer Type *</label>
            <select className="input" value={r.referrerType} onChange={(e) => setR({ ...r, referrerType: e.target.value })}>
              <option>CLIENT</option><option>BROKER</option>
            </select>
          </div>
          {r.referrerType === "CLIENT" ? (
            <div><label className="label">Existing Client</label>
              <select className="input" value={r.referrerId} onChange={(e) => { const c = clients.find((x: any) => x.id === e.target.value); setR({ ...r, referrerId: e.target.value, referrerName: c?.companyName || "" }); }}>
                <option value="">— Select —</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </div>
          ) : (
            <div><label className="label">Broker Name *</label><input className="input" required value={r.referrerName} onChange={(e) => setR({ ...r, referrerName: e.target.value })} /></div>
          )}
          <div><label className="label">Referrer Contact</label><input className="input" value={r.contact} onChange={(e) => setR({ ...r, contact: e.target.value })} /></div>
          <div><label className="label">Prospect Name *</label><input className="input" required value={r.prospectName} onChange={(e) => setR({ ...r, prospectName: e.target.value })} /></div>
          <div><label className="label">Prospect Phone</label><input className="input" value={r.prospectPhone} onChange={(e) => setR({ ...r, prospectPhone: e.target.value })} /></div>
          <div><label className="label">Agreed Fee (₹)</label><input className="input" type="number" value={r.feeAmount} onChange={(e) => setR({ ...r, feeAmount: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Save</button></div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Referrer</th><th>Type</th><th>Prospect</th><th>Converted</th><th>Fee</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            {initial.map((x: any) => (
              <tr key={x.id}>
                <td>{fmtDate(x.createdAt)}</td>
                <td>{x.referrerName}<div className="text-xs text-gray-500">{x.contact}</div></td>
                <td>{x.referrerType}</td>
                <td>{x.prospectName}<div className="text-xs text-gray-500">{x.prospectPhone}</div></td>
                <td>{x.converted ? "✅" : "—"}</td>
                <td>{fmtINR(x.feeAmount)}</td>
                <td>{x.feePaid ? "✅" : "—"}</td>
                <td>{x.converted && !x.feePaid && <button className="btn-ghost text-xs" onClick={() => markPaid(x.id)}>Mark paid</button>}</td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No referrals</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
