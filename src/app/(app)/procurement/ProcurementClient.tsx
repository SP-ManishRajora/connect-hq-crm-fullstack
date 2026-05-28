"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

const PO_CATS = ["TEA_COFFEE", "HOUSEKEEPING", "INTERNET", "ASSET", "REPAIR", "OTHER"];

export default function ProcurementClient({ prs, pos, vendors, centers }: any) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "PO" ? "PO" : "PR";
  const [tab, setTab] = useState<"PR" | "PO">(initialTab);
  const [showPR, setShowPR] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [pr, setPr] = useState<any>({ centerId: "", reason: "", items: [{ item: "", qty: 1, expectedRate: 0 }] });
  const [po, setPo] = useState<any>({ vendorId: "", centerId: "", category: "OTHER", isRecurring: false, recurrence: "MONTHLY", items: [{ item: "", qty: 1, rate: 0 }], prId: "" });

  const poTotal = po.items.reduce((s: number, i: any) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  async function submitPR(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/pr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pr) });
    if (r.ok) { setShowPR(false); router.refresh(); } else alert("Failed");
  }
  async function submitPO(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/po", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...po, totalAmount: poTotal }) });
    if (r.ok) { setShowPO(false); router.refresh(); } else alert("Failed");
  }
  async function confirmDelivery(id: string) {
    const notes = prompt("Delivery notes (e.g. condition, qty received):") || "";
    await fetch(`/api/po/${id}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="h1">Procurement</h1>

      <div className="flex border-b">
        <button onClick={() => setTab("PR")} className={`px-4 py-2 text-sm border-b-2 ${tab === "PR" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Purchase Requests ({prs.length})</button>
        <button onClick={() => setTab("PO")} className={`px-4 py-2 text-sm border-b-2 ${tab === "PO" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Purchase Orders ({pos.length})</button>
      </div>

      {tab === "PR" && (
        <>
          <button className="btn-primary" onClick={() => setShowPR(!showPR)}>+ Raise PR</button>
          {showPR && (
            <form onSubmit={submitPR} className="card space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Center *</label>
                  <select className="input" required value={pr.centerId} onChange={(e) => setPr({ ...pr, centerId: e.target.value })}>
                    <option value="">— Select —</option>
                    {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="label">Reason *</label><input className="input" required value={pr.reason} onChange={(e) => setPr({ ...pr, reason: e.target.value })} /></div>
              </div>
              <div>
                <label className="label">Items</label>
                {pr.items.map((it: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                    <input className="input col-span-6" placeholder="Item" value={it.item} onChange={(e) => { const x = [...pr.items]; x[idx].item = e.target.value; setPr({ ...pr, items: x }); }} />
                    <input className="input col-span-2" type="number" placeholder="Qty" value={it.qty} onChange={(e) => { const x = [...pr.items]; x[idx].qty = e.target.value; setPr({ ...pr, items: x }); }} />
                    <input className="input col-span-3" type="number" placeholder="Expected ₹" value={it.expectedRate} onChange={(e) => { const x = [...pr.items]; x[idx].expectedRate = e.target.value; setPr({ ...pr, items: x }); }} />
                    <button type="button" className="text-red-500 col-span-1" onClick={() => setPr({ ...pr, items: pr.items.filter((_: any, i: number) => i !== idx) })}>✕</button>
                  </div>
                ))}
                <button type="button" className="text-sm text-brand-600" onClick={() => setPr({ ...pr, items: [...pr.items, { item: "", qty: 1, expectedRate: 0 }] })}>+ Add line</button>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setShowPR(false)}>Cancel</button>
                <button className="btn-primary">Submit PR</button>
              </div>
            </form>
          )}
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Center</th><th>Raised By</th><th>Reason</th><th>Items</th><th>Status</th></tr></thead>
              <tbody>
                {prs.map((p: any) => {
                  const items = JSON.parse(p.itemsJson || "[]");
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.createdAt)}</td>
                      <td>{p.center.name}</td>
                      <td>{p.raisedBy?.name}</td>
                      <td>{p.reason}</td>
                      <td className="text-xs">{items.map((i: any, k: number) => <div key={k}>{i.item} × {i.qty}</div>)}</td>
                      <td><span className="badge bg-amber-100 text-amber-700">{p.status}</span></td>
                    </tr>
                  );
                })}
                {prs.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No PRs</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "PO" && (
        <>
          <button className="btn-primary" onClick={() => setShowPO(!showPO)}>+ Issue PO</button>
          {showPO && (
            <form onSubmit={submitPO} className="card space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label">Vendor *</label>
                  <select className="input" required value={po.vendorId} onChange={(e) => setPo({ ...po, vendorId: e.target.value })}>
                    <option value="">— Select —</option>
                    {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}
                  </select>
                </div>
                <div><label className="label">Center *</label>
                  <select className="input" required value={po.centerId} onChange={(e) => setPo({ ...po, centerId: e.target.value })}>
                    <option value="">— Select —</option>
                    {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="label">Category *</label>
                  <select className="input" value={po.category} onChange={(e) => setPo({ ...po, category: e.target.value })}>
                    {PO_CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <input id="recur" type="checkbox" checked={po.isRecurring} onChange={(e) => setPo({ ...po, isRecurring: e.target.checked })} />
                  <label htmlFor="recur" className="text-sm">Recurring</label>
                  {po.isRecurring && (
                    <select className="input max-w-xs" value={po.recurrence} onChange={(e) => setPo({ ...po, recurrence: e.target.value })}>
                      <option>MONTHLY</option><option>WEEKLY</option>
                    </select>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Items</label>
                {po.items.map((it: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                    <input className="input col-span-6" placeholder="Item" value={it.item} onChange={(e) => { const x = [...po.items]; x[idx].item = e.target.value; setPo({ ...po, items: x }); }} />
                    <input className="input col-span-2" type="number" placeholder="Qty" value={it.qty} onChange={(e) => { const x = [...po.items]; x[idx].qty = e.target.value; setPo({ ...po, items: x }); }} />
                    <input className="input col-span-3" type="number" placeholder="Rate" value={it.rate} onChange={(e) => { const x = [...po.items]; x[idx].rate = e.target.value; setPo({ ...po, items: x }); }} />
                    <button type="button" className="text-red-500 col-span-1" onClick={() => setPo({ ...po, items: po.items.filter((_: any, i: number) => i !== idx) })}>✕</button>
                  </div>
                ))}
                <button type="button" className="text-sm text-brand-600" onClick={() => setPo({ ...po, items: [...po.items, { item: "", qty: 1, rate: 0 }] })}>+ Add line</button>
                <div className="text-right font-semibold mt-2">Total: {fmtINR(poTotal)}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setShowPO(false)}>Cancel</button>
                <button className="btn-primary">Issue PO</button>
              </div>
            </form>
          )}
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Vendor</th><th>Center</th><th>Category</th><th>Total</th><th>Recurring</th><th>Payment</th><th>Delivery</th><th></th></tr></thead>
              <tbody>
                {pos.map((p: any) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td>{p.vendor.name}</td>
                    <td>{p.center.name}</td>
                    <td>{p.category}</td>
                    <td>{fmtINR(p.totalAmount)}</td>
                    <td>{p.isRecurring ? p.recurrence : "—"}</td>
                    <td><span className="badge bg-gray-100 text-gray-700">{p.paymentStatus}</span></td>
                    <td>{p.deliveryConfirmed ? "✅" : "—"}</td>
                    <td>
                      {!p.deliveryConfirmed && <button className="btn-ghost text-xs" onClick={() => confirmDelivery(p.id)}>Confirm Delivery</button>}
                    </td>
                  </tr>
                ))}
                {pos.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No POs</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
