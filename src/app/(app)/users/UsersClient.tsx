"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT", "CLIENT"];

export default function UsersClient({ users, centers }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [u, setU] = useState<any>({ name: "", email: "", password: "", role: "SALES", centerId: "", phone: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) });
    if (r.ok) { setShow(false); router.refresh(); } else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  async function delUser(id: string, name: string) {
    if (!confirm(`Disable user "${name}"? They will no longer be able to log in. (Soft delete — record kept for audit)`)) return;
    const r = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Users & Roles</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Add User</button>
      </div>
      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Name *</label><input className="input" required value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></div>
          <div><label className="label">Email *</label><input className="input" required type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} /></div>
          <div><label className="label">Password *</label><input className="input" required type="text" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} /></div>
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
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Create User</button></div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Center</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td>{u.email}</td>
                <td><span className="badge bg-gray-100 text-gray-700">{u.role}</span></td>
                <td>{u.center?.name || "—"}</td>
                <td>{u.active ? <span className="badge bg-emerald-100 text-emerald-700">Active</span> : <span className="badge bg-rose-100 text-rose-700">Disabled</span>}</td>
                <td>{u.active && <button className="text-xs text-red-600" onClick={() => delUser(u.id, u.name)}>Disable</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
