"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

const PO_CATS = ["TEA_COFFEE", "HOUSEKEEPING", "INTERNET", "ASSET", "REPAIR", "OTHER"];
const PR_STATUSES = ["OPEN", "APPROVED", "REJECTED", "ORDERED", "CLOSED"];

export default function ProcurementClient({ prs, pos, vendors, centers, role }: any) {
  const router = useRouter();
  // Only Accounts + Admin/Owner may change a PR's status.
  const canEditPRStatus = role === "ADMIN" || role === "OWNER" || role === "ACCOUNTS";

  async function updatePRStatus(id: string, status: string) {
    const r = await fetch(`/api/pr/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (r.ok) router.refresh();
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to update status"); }
  }

  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "PO" ? "PO" : "PR";
  const [tab, setTab] = useState<"PR" | "PO">(initialTab);
  const [showPR, setShowPR] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [viewPR, setViewPR] = useState<any>(null);
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
              <thead><tr><th>Date</th><th>Center</th><th>Raised By</th><th>Reason</th><th>Items</th><th>Status</th><th></th></tr></thead>
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
                      <td>
                        {canEditPRStatus ? (
                          <select
                            className="input py-1 text-xs"
                            title="Update status"
                            aria-label="Update PR status"
                            value={p.status}
                            onChange={(e) => updatePRStatus(p.id, e.target.value)}
                          >
                            {PR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-700">{p.status}</span>
                        )}
                      </td>
                      <td><button type="button" className="btn-ghost text-xs" onClick={() => setViewPR(p)}>View</button></td>
                    </tr>
                  );
                })}
                {prs.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No PRs</td></tr>}
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

      {/* View Purchase Request */}
      {viewPR && (() => {
        const items = JSON.parse(viewPR.itemsJson || "[]");
        const total = items.reduce((s: number, i: any) => s + (Number(i.qty) || 0) * (Number(i.expectedRate) || 0), 0);
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setViewPR(null)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[94%] max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">Purchase Request</h2>
                  <p className="text-xs text-gray-500">{fmtDate(viewPR.createdAt)} · {viewPR.center?.name}</p>
                </div>
                <span className="badge bg-amber-100 text-amber-700">{viewPR.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="muted">Raised by:</span> {viewPR.raisedBy?.name || "—"}</div>
                <div><span className="muted">Center:</span> {viewPR.center?.name || "—"}</div>
                <div className="col-span-2"><span className="muted">Reason:</span> {viewPR.reason || "—"}</div>
              </div>

              <div>
                <label className="label">Items</label>
                <table className="table text-sm">
                  <thead><tr><th>Item</th><th>Qty</th><th>Expected ₹</th><th>Line</th></tr></thead>
                  <tbody>
                    {items.map((i: any, k: number) => (
                      <tr key={k}>
                        <td>{i.item}</td>
                        <td>{i.qty}</td>
                        <td>{i.expectedRate ? fmtINR(Number(i.expectedRate)) : "—"}</td>
                        <td>{fmtINR((Number(i.qty) || 0) * (Number(i.expectedRate) || 0))}</td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-3">No items</td></tr>}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot><tr><td colSpan={3} className="text-right font-medium">Estimated total</td><td className="font-medium">{fmtINR(total)}</td></tr></tfoot>
                  )}
                </table>
              </div>

              <div className="flex justify-end">
                <button type="button" className="btn-ghost text-sm" onClick={() => setViewPR(null)}>Close</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
