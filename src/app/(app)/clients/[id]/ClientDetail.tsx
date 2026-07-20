"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtINR } from "@/lib/utils";

export default function ClientDetail({ client, pendingInvites = [], role = null }: any) {
  const router = useRouter();
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [emp, setEmp] = useState<any>({ name: "", email: "", phone: "", aadhaar: "", pan: "", designation: "", password: "" });
  const [occ, setOcc] = useState<number>(client.occupiedSeats || 0);
  const [picUserId, setPicUserId] = useState<string>(client.picUserId || "");

  // Onboarding (contract start) date editing — ADMIN and CENTER_MANAGER only.
  const canEditStart = role === "ADMIN" || role === "CENTER_MANAGER";
  const isoDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const [editStart, setEditStart] = useState(false);
  const [startDate, setStartDate] = useState<string>(isoDate(client.contract?.startDate));
  const [savingStart, setSavingStart] = useState(false);

  async function saveStartDate(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate) return;
    setSavingStart(true);
    const r = await fetch(`/api/clients/${client.id}/start-date`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate }),
    });
    setSavingStart(false);
    if (r.ok) {
      setEditStart(false);
      router.refresh();
    } else {
      const d = await r.json().catch(() => ({}));
      alert(d?.error || "Failed to update start date");
    }
  }

  const [inviteEmail, setInviteEmail] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  async function addEmp(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/clients/${client.id}/employees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emp) });
    if (r.ok) { setShowAddEmp(false); setEmp({ name: "", email: "", phone: "", aadhaar: "", pan: "", designation: "", password: "" }); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/clients/${client.id}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setInviteEmail(""); setShowInvite(false);
      alert(j.link ? `Invite sent. If email is not configured, share this link:\n${j.link}` : "Invite sent.");
      router.refresh();
    } else {
      alert(j.error || "Failed to send invite");
    }
  }

  async function resendInvite(inviteId: string) {
    const r = await fetch(`/api/clients/${client.id}/invites/${inviteId}/resend`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      alert(j.link ? `Invite resent. If email is not configured, share this link:\n${j.link}` : "Invite resent.");
      router.refresh();
    } else {
      alert(j.error || "Failed to resend invite");
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm("Revoke this pending invite? The link will stop working.")) return;
    const r = await fetch(`/api/clients/${client.id}/invites/${inviteId}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to revoke"); }
  }

  async function uploadContract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "contracts");
    const u = await fetch("/api/upload", { method: "POST", body: fd });
    const { path } = await u.json();
    const r = await fetch(`/api/clients/${client.id}/contract-upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
    if (r.ok) { alert("Contract uploaded — OCR scheduled"); router.refresh(); }
  }

  async function setPic() {
    await fetch(`/api/clients/${client.id}/pic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picUserId }) });
    router.refresh();
  }

  async function setOccupancy() {
    await fetch(`/api/clients/${client.id}/occupancy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occupiedSeats: occ }) });
    router.refresh();
  }

  async function delEmp(id: string) {
    if (!confirm("Remove this employee's access?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href="/clients" className="text-sm text-brand-600">← Back to clients</Link>
      <div>
        <h1 className="h1">{client.companyName}</h1>
        <p className="muted">{client.contactName} · {client.email} · {client.phone}</p>
        <p className="muted">Center: {client.center.name} · Cabin: {client.cabin?.name || "Open seats"}</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h2 className="h2">Occupancy & PIC</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Total seats taken</label>
              <input className="input" type="number" value={client.totalCabinSeats || 0} readOnly />
            </div>
            <div><label className="label">Currently occupied</label>
              <input className="input" type="number" value={occ} onChange={(e) => setOcc(Number(e.target.value))} />
            </div>
          </div>
          <button className="btn-ghost text-xs" onClick={setOccupancy}>Update occupancy</button>
          <p className="muted text-xs">Half-price billing on unused seats kicks in on next monthly invoice run. Sales reminder fires after 3 months of partial occupancy.</p>

          <div>
            <label className="label">Person In Charge (PIC)</label>
            {client.employees.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                No employees added yet. Add an employee in the <strong>Employee Directory</strong> below, then come back here to set them as PIC.
                <button type="button" className="block mt-2 underline font-medium" onClick={() => { setShowAddEmp(true); document.getElementById("add-emp-section")?.scrollIntoView({ behavior: "smooth" }); }}>
                  + Add an employee now
                </button>
              </div>
            ) : (
              <>
                <select aria-label="Person In Charge" className="input" value={picUserId} onChange={(e) => setPicUserId(e.target.value)}>
                  <option value="">— Select —</option>
                  {client.employees.map((u: any) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
                </select>
                <button type="button" className="btn-ghost text-xs mt-2" onClick={setPic}>Set as PIC</button>
              </>
            )}
            {client.pic && <p className="muted text-xs mt-1">Current: {client.pic.name} · {client.pic.email}</p>}
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="h2">Contract</h2>
          {client.contract ? (
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span>Start: {fmtDate(client.contract.startDate)}</span>
                {canEditStart && !editStart && (
                  <button
                    type="button"
                    className="text-brand-600 text-xs hover:underline"
                    onClick={() => { setStartDate(isoDate(client.contract.startDate)); setEditStart(true); }}
                  >
                    Edit
                  </button>
                )}
              </div>
              {canEditStart && editStart && (
                <form onSubmit={saveStartDate} className="flex items-center gap-2 mt-1">
                  <input
                    className="input"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <button type="submit" className="btn-primary text-xs px-2 py-1" disabled={savingStart}>
                    {savingStart ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={() => setEditStart(false)}>
                    Cancel
                  </button>
                </form>
              )}
              <div>Monthly Rent: {fmtINR(client.contract.monthlyRent)}</div>
              <div>Increment: {client.contract.incrementPct}%</div>
              <div>Next revision: {fmtDate(client.contract.revisionDate)}</div>
              {client.contract.filePath && <a href={client.contract.filePath} target="_blank" className="text-brand-600 text-xs">View uploaded contract</a>}
              {client.contract.ocrParsedJson && (
                <pre className="text-xs bg-gray-50 p-2 rounded mt-2">{client.contract.ocrParsedJson}</pre>
              )}
            </div>
          ) : <p className="muted">No contract yet.</p>}
          <div>
            <label className="label">Upload existing contract (PDF/image — OCR will extract dates)</label>
            <input type="file" accept="application/pdf,image/*" onChange={uploadContract} />
          </div>
        </div>
      </div>

      <div id="add-emp-section" className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="h2">Employee Directory ({client.employees.length})</h2>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setShowInvite(!showInvite)}>✉ Invite via email</button>
            <button className="btn-primary" onClick={() => setShowAddEmp(!showAddEmp)}>+ Add Employee</button>
          </div>
        </div>
        <p className="muted text-xs">Each employee gets a portal login (used for internet, meeting rooms, complaints). Invites are capped by the client's occupied seats.</p>

        {showInvite && (
          <form onSubmit={sendInvite} className="flex gap-2 items-end mt-3 border rounded p-3 flex-wrap">
            <div className="flex-1 min-w-[220px]"><label className="label">Email to invite</label><input className="input" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@company.com" /></div>
            <button className="btn-primary">Send invite</button>
            <button type="button" className="btn-ghost" onClick={() => setShowInvite(false)}>Cancel</button>
          </form>
        )}

        {pendingInvites.length > 0 && (
          <div className="mt-3 border rounded p-3">
            <div className="text-sm font-medium mb-2">Pending invites ({pendingInvites.length})</div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Email</th><th>Sent</th><th>Expires</th><th></th></tr></thead>
                <tbody>
                  {pendingInvites.map((inv: any) => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td className="text-xs">{fmtDate(inv.createdAt)}</td>
                      <td className="text-xs">{fmtDate(inv.expiresAt)}</td>
                      <td className="whitespace-nowrap">
                        <button className="text-xs text-brand-600 mr-3" onClick={() => resendInvite(inv.id)}>Resend</button>
                        <button className="text-xs text-red-600" onClick={() => revokeInvite(inv.id)}>Revoke</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showAddEmp && (
          <form onSubmit={addEmp} className="grid sm:grid-cols-2 gap-3 mt-3 border rounded p-3">
            <div><label className="label">Name *</label><input className="input" required value={emp.name} onChange={(e) => setEmp({ ...emp, name: e.target.value })} /></div>
            <div><label className="label">Email (login) *</label><input className="input" required type="email" value={emp.email} onChange={(e) => setEmp({ ...emp, email: e.target.value })} /></div>
            <div><label className="label">Designation</label><input className="input" value={emp.designation} onChange={(e) => setEmp({ ...emp, designation: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={emp.phone} onChange={(e) => setEmp({ ...emp, phone: e.target.value })} /></div>
            <div><label className="label">Aadhaar</label><input className="input" value={emp.aadhaar} onChange={(e) => setEmp({ ...emp, aadhaar: e.target.value })} /></div>
            <div><label className="label">PAN</label><input className="input" value={emp.pan} onChange={(e) => setEmp({ ...emp, pan: e.target.value.toUpperCase() })} /></div>
            <div><label className="label">Password * (share with employee)</label><input className="input" required value={emp.password} onChange={(e) => setEmp({ ...emp, password: e.target.value })} /></div>
            <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShowAddEmp(false)}>Cancel</button><button className="btn-primary">Create</button></div>
          </form>
        )}

        <div className="overflow-x-auto mt-3">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Designation</th><th>Phone</th><th>Aadhaar/PAN</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {client.employees.map((u: any) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.designation || "—"}</td>
                  <td>{u.phone || "—"}</td>
                  <td className="text-xs">{u.aadhaar}<br />{u.pan}</td>
                  <td>{u.active ? "✅" : "—"}</td>
                  <td>{u.active && <button className="text-xs text-red-600" onClick={() => delEmp(u.id)}>Disable</button>}</td>
                </tr>
              ))}
              {client.employees.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-6">No employees yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
