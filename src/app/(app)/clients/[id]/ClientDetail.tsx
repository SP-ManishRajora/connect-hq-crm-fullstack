"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtINR } from "@/lib/utils";

export default function ClientDetail({ client }: any) {
  const router = useRouter();
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [emp, setEmp] = useState<any>({ name: "", email: "", phone: "", aadhaar: "", pan: "", designation: "", password: "" });
  const [occ, setOcc] = useState<number>(client.occupiedSeats || client.proposal?.seats || 0);
  const [picUserId, setPicUserId] = useState<string>(client.picUserId || "");

  async function addEmp(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/clients/${client.id}/employees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emp) });
    if (r.ok) { setShowAddEmp(false); setEmp({ name: "", email: "", phone: "", aadhaar: "", pan: "", designation: "", password: "" }); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
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
              <input className="input" type="number" value={client.totalCabinSeats || client.proposal?.seats || 0} readOnly />
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
              <div>Start: {fmtDate(client.contract.startDate)}</div>
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
          <button className="btn-primary" onClick={() => setShowAddEmp(!showAddEmp)}>+ Add Employee</button>
        </div>
        <p className="muted text-xs">Each employee gets a portal login (used for internet, meeting rooms, complaints).</p>

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
