"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

export default function VendorInvoicesClient({ initial, vendors, pos }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [poId, setPoId] = useState("");
  const [path, setPath] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "vendor-invoices");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json(); setPath(j.path);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!path) { alert("Upload invoice file first"); return; }
    const r = await fetch("/api/vendor-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId, poId, filePath: path }) });
    if (r.ok) { setShow(false); setPath(""); setVendorId(""); setPoId(""); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const remarks = decision === "REJECTED" ? prompt("Reason for rejection:") || "" : "";
    await fetch(`/api/vendor-invoices/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, remarks }) });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="h1">Vendor Invoices</h1>
          <p className="muted">Upload → OCR extracts fields → match to PO → approve → book expense.</p>
        </div>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Upload Invoice</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Vendor *</label>
            <select className="input" required value={vendorId} onChange={(e) => { setVendorId(e.target.value); setPoId(""); }}>
              <option value="">— Select —</option>
              {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {vendorId && (() => {
            const filteredPos = pos.filter((p: any) => p.vendorId === vendorId);
            return (
              <div>
                <label className="label">Match to PO (optional)</label>
                <select aria-label="Match to PO" className="input" value={poId} onChange={(e) => setPoId(e.target.value)} disabled={filteredPos.length === 0}>
                  <option value="">{filteredPos.length === 0 ? "— No unpaid POs for this vendor —" : "— None —"}</option>
                  {filteredPos.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.poNumber || p.id.slice(0,8)} · {fmtINR(p.totalAmount)}</option>
                  ))}
                </select>
                {filteredPos.length === 0 && (
                  <p className="muted text-xs mt-1">
                    This vendor has no unpaid POs. Submit without a PO match, or{" "}
                    <Link href="/procurement?tab=PO" className="underline font-medium text-brand-600">create a PO →</Link>
                  </p>
                )}
              </div>
            );
          })()}
          <div className="sm:col-span-2"><label className="label">Invoice file (PDF/image) *</label>
            <input type="file" accept="application/pdf,image/*" onChange={handleFile} />
            {path && <p className="muted text-xs mt-1">Uploaded: {path}</p>}
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Submit for OCR</button></div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Vendor</th><th>PO Match</th><th>Inv #</th><th>Amount</th><th>GST</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {initial.map((i: any) => (
              <tr key={i.id}>
                <td>{fmtDate(i.createdAt)}</td>
                <td>{i.vendor.name}</td>
                <td>{i.po ? (
                  <span className={`badge ${i.poMatchStatus === "MATCHED" ? "bg-emerald-100 text-emerald-700" : i.poMatchStatus === "MISMATCH" ? "bg-rose-100 text-rose-700" : "bg-gray-100 text-gray-700"}`}>{i.poMatchStatus}: {i.po.poNumber || i.po.id.slice(0, 8)}</span>
                ) : <span className="muted text-xs">No PO</span>}</td>
                <td className="font-mono text-xs">{i.invoiceNo || "—"}</td>
                <td>{fmtINR(i.amount)}</td>
                <td>{fmtINR(i.gst)}</td>
                <td><span className={`badge ${i.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : i.status === "REJECTED" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{i.status}</span></td>
                <td className="space-x-1">
                  <a href={i.filePath} target="_blank" className="text-brand-600 text-xs">View</a>
                  {i.status === "PENDING" && (
                    <>
                      <button className="btn-ghost text-xs" onClick={() => decide(i.id, "APPROVED")}>Approve</button>
                      <button className="btn-ghost text-xs" onClick={() => decide(i.id, "REJECTED")}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No vendor invoices uploaded yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
