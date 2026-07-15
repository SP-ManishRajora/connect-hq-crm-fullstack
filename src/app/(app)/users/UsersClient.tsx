"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT", "CLIENT"];
const EMPTY = { name: "", email: "", password: "", role: "SALES", centerId: "", phone: "" };

export default function UsersClient({ users, centers }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = create mode
  const [u, setU] = useState<any>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditingId(null);
    setU(EMPTY);
    setErr(null);
    setShow(true);
  }

  function openEdit(row: any) {
    setEditingId(row.id);
    setU({
      name: row.name || "",
      email: row.email || "",
      password: "", // blank = keep current
      role: row.role || "SALES",
      centerId: row.centerId || "",
      phone: row.phone || "",
    });
    setErr(null);
    setShow(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const isEdit = Boolean(editingId);
    const url = isEdit ? `/api/users/${editingId}` : "/api/users";
    const method = isEdit ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) });
    setBusy(false);
    if (r.ok) {
      setShow(false);
      setEditingId(null);
      setU(EMPTY);
      router.refresh();
    } else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "Failed");
    }
  }

  async function delUser(id: string, name: string) {
    if (!confirm(`Disable user "${name}"? They will no longer be able to log in. (Soft delete — record kept for audit)`)) return;
    const r = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  const isEdit = Boolean(editingId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Users & Roles</h1>
        <button className="btn-primary" onClick={() => (show && !isEdit ? setShow(false) : openCreate())}>+ Add User</button>
      </div>
      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">{isEdit ? "Edit User" : "Add User"}</h2>
          <div><label className="label">Name *</label><input className="input" required value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></div>
          <div><label className="label">Email *</label><input className="input" required type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} /></div>
          <div>
            <label className="label">{isEdit ? "New Password (leave blank to keep)" : "Password *"}</label>
            <input className="input" required={!isEdit} type="text" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} placeholder={isEdit ? "Unchanged" : ""} />
          </div>
          <div><label className="label">Phone</label><input className="input" value={u.phone} onChange={(e) => setU({ ...u, phone: e.target.value })} /></div>
          <div><label className="label">Role</label>
            <select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <div><label className="label">Center (if center-bound)</label>
            <select className="input" value={u.centerId} onChange={(e) => setU({ ...u, centerId: e.target.value })}>
              <option value="">— None —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {err && <p className="sm:col-span-2 text-red-600 text-sm">{err}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setShow(false); setEditingId(null); setU(EMPTY); }}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save Changes" : "Create User"}</button>
          </div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Center</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((row: any) => (
              <tr key={row.id}>
                <td className="font-medium">{row.name}</td>
                <td>{row.email}</td>
                <td><span className="badge bg-gray-100 text-gray-700">{row.role}</span></td>
                <td>{row.center?.name || "—"}</td>
                <td>{row.active ? <span className="badge bg-emerald-100 text-emerald-700">Active</span> : <span className="badge bg-rose-100 text-rose-700">Disabled</span>}</td>
                <td className="whitespace-nowrap">
                  <button className="text-xs text-brand-600 mr-3" onClick={() => openEdit(row)}>Edit</button>
                  {row.active && <button className="text-xs text-red-600" onClick={() => delUser(row.id, row.name)}>Disable</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
