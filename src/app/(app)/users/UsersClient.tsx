"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/utils";

const ROLES = ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT", "CLIENT"];
const EMPTY = { name: "", email: "", password: "", role: "SALES", centerId: "", phone: "" };

export default function UsersClient({ users, centers, invites = [], resets = [], allModules = [], defaultByRole = {} }: any) {
  const router = useRouter();
  const [tab, setTab] = useState<"USERS" | "INVITES" | "RESETS">("USERS");

  // ---- Create / edit user (existing functionality, preserved) ----
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = create mode
  const [u, setU] = useState<any>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- Invite (patch v4) ----
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState<any>({ name: "", email: "", role: "SALES", centerId: "", allowedModules: [] as string[] });

  // ---- Per-user modules editor (patch v4) ----
  const [editModFor, setEditModFor] = useState<string | null>(null);
  const [editMod, setEditMod] = useState<string[]>([]);

  // ---- Transfer (patch v4) ----
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<any>({ toUserId: "", reason: "", deactivate: true });

  function defaultModulesFor(role: string): string[] {
    return Object.keys(defaultByRole).filter((m) => (defaultByRole[m] as string[]).includes(role));
  }

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
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/invites", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...invite, allowedModules: invite.allowedModules.length ? invite.allowedModules : null }),
    });
    if (r.ok) {
      const j = await r.json();
      alert(`Invite sent. Link (also emailed):\n${j.link}`);
      setShowInvite(false);
      setInvite({ name: "", email: "", role: "SALES", centerId: "", allowedModules: [] });
      router.refresh();
    } else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  function openModulesEditor(userId: string, current: string | null, role: string) {
    setEditModFor(userId);
    if (current) {
      try { setEditMod(JSON.parse(current)); } catch { setEditMod(defaultModulesFor(role)); }
    } else {
      setEditMod(defaultModulesFor(role));
    }
  }
  async function saveModules() {
    const r = await fetch(`/api/users/${editModFor}/modules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedModules: editMod }) });
    if (r.ok) { setEditModFor(null); router.refresh(); }
  }
  async function resetToDefault() {
    const r = await fetch(`/api/users/${editModFor}/modules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedModules: null }) });
    if (r.ok) { setEditModFor(null); router.refresh(); }
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/users/${transferFor}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(transfer) });
    if (r.ok) {
      const j = await r.json();
      alert(`Transferred:\n  Open leads: ${j.recordsAffected.leads}\n  Future bookings: ${j.recordsAffected.bookings}\n  Open PRs: ${j.recordsAffected.purchaseRequests}`);
      setTransferFor(null); setTransfer({ toUserId: "", reason: "", deactivate: true });
      router.refresh();
    } else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  async function decideReset(id: string, decision: "APPROVE" | "REJECT") {
    let remarks = "";
    if (decision === "REJECT") { remarks = prompt("Reason for rejection:") || ""; if (!remarks) return; }
    const r = await fetch(`/api/password-resets/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, remarks }) });
    if (r.ok) { router.refresh(); } else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  const isEdit = Boolean(editingId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Users & Access</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => (showInvite ? setShowInvite(false) : (setShow(false), setShowInvite(true)))}>+ Invite User</button>
          <button className="btn-primary" onClick={() => (show && !isEdit ? setShow(false) : (setShowInvite(false), openCreate()))}>+ Add User</button>
        </div>
      </div>

      <div className="flex border-b">
        <button onClick={() => setTab("USERS")} className={`px-4 py-2 text-sm border-b-2 ${tab === "USERS" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Users ({users.length})</button>
        <button onClick={() => setTab("INVITES")} className={`px-4 py-2 text-sm border-b-2 ${tab === "INVITES" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Invites ({invites.length})</button>
        <button onClick={() => setTab("RESETS")} className={`px-4 py-2 text-sm border-b-2 ${tab === "RESETS" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Password Resets ({resets.filter((r: any) => r.status === "PENDING").length} pending)</button>
      </div>

      {/* Create / edit user form */}
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

      {/* Invite form (patch v4) */}
      {showInvite && (
        <form onSubmit={sendInvite} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">Invite a new user</h2>
          <div><label className="label">Name *</label><input className="input" required value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></div>
          <div><label className="label">Email *</label><input className="input" required type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></div>
          <div><label className="label">Role *</label>
            <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value, allowedModules: defaultModulesFor(e.target.value) })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Center</label>
            <select className="input" value={invite.centerId} onChange={(e) => setInvite({ ...invite, centerId: e.target.value })}>
              <option value="">— None —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Allowed modules (overrides default for the role)</label>
            <p className="muted text-xs mb-2">Tick to grant. Leave default to use role-based defaults.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-sm">
              {allModules.map((m: string) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="checkbox" checked={invite.allowedModules.includes(m)} onChange={(e) => {
                    if (e.target.checked) setInvite({ ...invite, allowedModules: [...invite.allowedModules, m] });
                    else setInvite({ ...invite, allowedModules: invite.allowedModules.filter((x: string) => x !== m) });
                  }} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
            <button type="button" className="btn-ghost text-xs mt-2" onClick={() => setInvite({ ...invite, allowedModules: defaultModulesFor(invite.role) })}>Reset to role defaults</button>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShowInvite(false)}>Cancel</button><button className="btn-primary">Send Invite</button></div>
        </form>
      )}

      {/* USERS tab */}
      {tab === "USERS" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Center</th><th>Modules</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.name}{row.transferredTo && <div className="text-xs text-gray-500">→ transferred to {row.transferredTo.name}</div>}</td>
                  <td>{row.email}</td>
                  <td><span className="badge bg-gray-100 text-gray-700">{row.role}</span></td>
                  <td>{row.center?.name || "—"}</td>
                  <td className="text-xs">{row.allowedModules ? `${(JSON.parse(row.allowedModules) as string[]).length} custom` : "Role default"}</td>
                  <td>{row.active ? <span className="badge bg-emerald-100 text-emerald-700">Active</span> : <span className="badge bg-rose-100 text-rose-700">Disabled</span>}</td>
                  <td className="whitespace-nowrap space-x-2 text-xs">
                    <button className="text-brand-600" onClick={() => openEdit(row)}>Edit</button>
                    <button className="text-brand-600" onClick={() => openModulesEditor(row.id, row.allowedModules, row.role)}>Modules</button>
                    {row.active && <button className="text-amber-700" onClick={() => { setTransferFor(row.id); setTransfer({ toUserId: "", reason: "", deactivate: true }); }}>Transfer</button>}
                    {row.active && <button className="text-red-600" onClick={() => delUser(row.id, row.name)}>Disable</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* INVITES tab */}
      {tab === "INVITES" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Invited by</th><th>Expires</th></tr></thead>
            <tbody>
              {invites.map((i: any) => (
                <tr key={i.id}>
                  <td>{fmtDate(i.createdAt)}</td>
                  <td className="font-medium">{i.name}</td>
                  <td>{i.email}</td>
                  <td>{i.role}</td>
                  <td><span className={`badge ${i.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700" : i.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{i.status}</span></td>
                  <td>{i.invitedBy?.name}</td>
                  <td className="text-xs">{fmtDate(i.expiresAt)}</td>
                </tr>
              ))}
              {invites.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No invites yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* RESETS tab */}
      {tab === "RESETS" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>User</th><th>Reason</th><th>Status</th><th>Decided</th><th></th></tr></thead>
            <tbody>
              {resets.map((r: any) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>{r.user.name}<div className="text-xs text-gray-500">{r.user.email}</div></td>
                  <td className="text-xs">{r.reason || "—"}</td>
                  <td><span className={`badge ${r.status === "PENDING" ? "bg-amber-100 text-amber-700" : r.status === "APPROVED" ? "bg-blue-100 text-blue-700" : r.status === "USED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{r.status}</span></td>
                  <td className="text-xs">{r.decidedAt ? fmtDate(r.decidedAt) : "—"}</td>
                  <td className="space-x-1 text-xs">
                    {r.status === "PENDING" && (
                      <>
                        <button className="text-emerald-700" onClick={() => decideReset(r.id, "APPROVE")}>Approve</button>
                        <button className="text-red-600" onClick={() => decideReset(r.id, "REJECT")}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {resets.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">No reset requests</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modules editor modal */}
      {editModFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-2xl w-full">
            <h2 className="h2">Edit allowed modules</h2>
            <p className="muted text-xs">Tick = allow. Empty list resets to role defaults.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-sm mt-3 max-h-96 overflow-y-auto">
              {allModules.map((m: string) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="checkbox" checked={editMod.includes(m)} onChange={(e) => {
                    if (e.target.checked) setEditMod([...editMod, m]); else setEditMod(editMod.filter((x) => x !== m));
                  }} />
                  <span>{m}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn-ghost" onClick={() => setEditModFor(null)}>Cancel</button>
              <button className="btn-ghost" onClick={resetToDefault}>Reset to role defaults</button>
              <button className="btn-primary" onClick={saveModules}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {transferFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={submitTransfer} className="card max-w-md w-full">
            <h2 className="h2">Transfer user's work</h2>
            <p className="muted text-xs">Reassigns open leads, future bookings and open PRs to another user. Audit logged.</p>
            <div className="mt-3">
              <label className="label">Transfer to *</label>
              <select className="input" required value={transfer.toUserId} onChange={(e) => setTransfer({ ...transfer, toUserId: e.target.value })}>
                <option value="">— Select —</option>
                {users.filter((row: any) => row.id !== transferFor && row.active).map((row: any) => (
                  <option key={row.id} value={row.id}>{row.name} ({row.role})</option>
                ))}
              </select>
            </div>
            <div className="mt-3"><label className="label">Reason</label><input className="input" value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })} placeholder="On leave / Left org" /></div>
            <div className="mt-3 flex items-center gap-2"><input id="deact" type="checkbox" checked={transfer.deactivate} onChange={(e) => setTransfer({ ...transfer, deactivate: e.target.checked })} /><label htmlFor="deact" className="text-sm">Also disable source user (e.g., they've left)</label></div>
            <div className="flex justify-end gap-2 mt-3"><button type="button" className="btn-ghost" onClick={() => setTransferFor(null)}>Cancel</button><button className="btn-primary">Transfer</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
