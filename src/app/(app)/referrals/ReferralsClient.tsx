"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate, fmtDateTime } from "@/lib/utils";

// Referrer categories. CLIENT is special (links to an existing client record);
// every other type uses the free-text referrer name field.
const REFERRER_TYPES: { value: string; label: string }[] = [
  { value: "CLIENT", label: "Existing Client" },
  { value: "BROKER", label: "Broker" },
  { value: "AGENT", label: "Agent / Channel Partner" },
  { value: "IPC", label: "IPC (International Property Consultant)" },
  { value: "EMPLOYEE", label: "Employee (internal)" },
  { value: "PARTNER", label: "Business Partner" },
  { value: "VENDOR", label: "Vendor / Supplier" },
  { value: "EX_CLIENT", label: "Former Client" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "WEBSITE", label: "Website / Inbound" },
  { value: "SOCIAL_MEDIA", label: "Social Media" },
  { value: "EVENT", label: "Event / Expo" },
  { value: "OTHER", label: "Other" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(REFERRER_TYPES.map((t) => [t.value, t.label]));
const typeLabel = (v: string) => TYPE_LABEL[v] || v;

const EMPTY = { referrerType: "CLIENT", referrerId: "", referrerName: "", contact: "", prospectName: "", prospectPhone: "", feeAmount: 0, notes: "" };

export default function ReferralsClient({ initial, clients, canManage }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [r, setR] = useState<any>({ ...EMPTY });

  function openCreate() {
    setEditingId(null);
    setR({ ...EMPTY });
    setShow(true);
  }

  function openEdit(x: any) {
    setEditingId(x.id);
    setR({
      referrerType: x.referrerType,
      referrerId: x.referrerId || "",
      referrerName: x.referrerName || "",
      contact: x.contact || "",
      prospectName: x.prospectName || "",
      prospectPhone: x.prospectPhone || "",
      feeAmount: x.feeAmount ?? 0,
      notes: x.notes || "",
    });
    setShow(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/referrals/${editingId}` : "/api/referrals";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    if (res.ok) {
      setShow(false);
      setEditingId(null);
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  async function markPaid(id: string) {
    await fetch(`/api/referrals/${id}/pay`, { method: "POST" });
    router.refresh();
  }

  async function remove(x: any) {
    if (!confirm(`Delete referral for "${x.prospectName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/referrals/${x.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Referrals (Clients & Brokers)</h1>
        <button type="button" className="btn-primary" onClick={() => (show && !editingId ? setShow(false) : openCreate())}>+ New Referral</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 font-medium">{editingId ? "Edit Referral" : "New Referral"}</div>
          <div><label className="label">Referrer Type *</label>
            <select className="input" title="Referrer Type" value={r.referrerType} onChange={(e) => setR({ ...r, referrerType: e.target.value })}>
              {REFERRER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {r.referrerType === "CLIENT" ? (
            <div><label className="label">Existing Client</label>
              <select className="input" title="Existing Client" value={r.referrerId} onChange={(e) => { const c = clients.find((x: any) => x.id === e.target.value); setR({ ...r, referrerId: e.target.value, referrerName: c?.companyName || r.referrerName }); }}>
                <option value="">— Select —</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </div>
          ) : (
            <div><label className="label">Referrer Name *</label><input className="input" title="Referrer Name" placeholder="Referrer Name" required value={r.referrerName} onChange={(e) => setR({ ...r, referrerName: e.target.value })} /></div>
          )}
          <div><label className="label">Referrer Contact</label><input className="input" title="Referrer Contact" placeholder="Referrer Contact" value={r.contact} onChange={(e) => setR({ ...r, contact: e.target.value })} /></div>
          <div><label className="label">Prospect Name *</label><input className="input" title="Prospect Name" placeholder="Prospect Name" required value={r.prospectName} onChange={(e) => setR({ ...r, prospectName: e.target.value })} /></div>
          <div><label className="label">Prospect Phone</label><input className="input" title="Prospect Phone" placeholder="Prospect Phone" value={r.prospectPhone} onChange={(e) => setR({ ...r, prospectPhone: e.target.value })} /></div>
          <div><label className="label">Agreed Fee (₹)</label><input className="input" type="number" title="Agreed Fee" placeholder="Agreed Fee" value={r.feeAmount} onChange={(e) => setR({ ...r, feeAmount: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input" title="Notes" placeholder="Notes" rows={2} value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => { setShow(false); setEditingId(null); }}>Cancel</button><button type="submit" className="btn-primary">{editingId ? "Update" : "Save"}</button></div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Referrer</th><th>Type</th><th>Prospect</th><th>Converted</th><th>Fee</th><th>Paid</th><th aria-label="Actions"></th></tr></thead>
          <tbody>
            {initial.map((x: any) => (
              <Fragment key={x.id}>
              <tr>
                <td>{fmtDate(x.createdAt)}</td>
                <td>{x.referrerName}<div className="text-xs text-gray-500">{x.contact}</div></td>
                <td>{typeLabel(x.referrerType)}</td>
                <td>{x.prospectName}<div className="text-xs text-gray-500">{x.prospectPhone}</div></td>
                <td>{x.converted ? "✅" : "—"}</td>
                <td>{fmtINR(x.feeAmount)}</td>
                <td>{x.feePaid ? "✅" : "—"}</td>
                <td>
                  <div className="flex gap-2 justify-end whitespace-nowrap">
                    <button type="button" className="btn-ghost text-xs" onClick={() => setExpandedId(expandedId === x.id ? null : x.id)}>
                      {expandedId === x.id ? "Hide" : "Details"}
                    </button>
                    {x.converted && !x.feePaid && <button type="button" className="btn-ghost text-xs" onClick={() => markPaid(x.id)}>Mark paid</button>}
                    {canManage && <button type="button" className="btn-ghost text-xs" onClick={() => openEdit(x)}>Edit</button>}
                    {canManage && <button type="button" className="btn-ghost text-xs text-rose-600" onClick={() => remove(x)}>Delete</button>}
                  </div>
                </td>
              </tr>
              {expandedId === x.id && (
                <tr>
                  <td colSpan={8} className="bg-gray-50">
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 p-2 text-sm">
                      <div><span className="muted">Referrer:</span> {x.referrerName} ({typeLabel(x.referrerType)})</div>
                      <div><span className="muted">Referrer contact:</span> {x.contact || "—"}</div>
                      <div><span className="muted">Prospect:</span> {x.prospectName}</div>
                      <div><span className="muted">Prospect phone:</span> {x.prospectPhone || "—"}</div>
                      <div><span className="muted">Linked client:</span> {x.referrer?.companyName || "—"}</div>
                      <div><span className="muted">Converted client:</span> {x.convertedClient?.companyName || (x.converted ? "Converted" : "—")}</div>
                      <div><span className="muted">Agreed fee:</span> {fmtINR(x.feeAmount)}</div>
                      <div><span className="muted">Fee paid:</span> {x.feePaid ? "Yes" : "No"}</div>
                      <div><span className="muted">Created:</span> {fmtDateTime(x.createdAt)}</div>
                      <div className="sm:col-span-2"><span className="muted">Notes:</span> {x.notes || "—"}</div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {initial.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No referrals</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
