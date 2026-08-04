"use client";
import { useEffect, useState } from "react";

// Role management (Users → Roles). Create a role, tick which modules it can see,
// and it becomes available in the role dropdown everywhere.
//
// Built-in roles are editable but not deletable, and a role in use cannot be
// deleted at all — that is what stops a repeat of the EMPLOYEE case, where a
// user held a role nothing recognised and silently had no access.

type Role = {
  id: string; key: string; label: string; description: string | null;
  modules: string[]; builtIn: boolean; active: boolean; userCount: number;
};

// Grouped so ~40 checkboxes read as a structure rather than a wall.
const GROUPS: { title: string; match: (m: string) => boolean }[] = [
  { title: "Housekeeping", match: (m) => m === "housekeeping" || m.startsWith("hk_") },
  { title: "Occupancy & centres", match: (m) => m.startsWith("occupancy") || ["centers", "seatmap", "dashboard"].includes(m) },
  { title: "Sales & clients", match: (m) => ["leads", "visitors", "proposals", "clients", "referrals", "bulk_import"].includes(m) },
  { title: "Operations", match: (m) => ["vendors", "procurement", "vendor_invoices", "recurring", "inventory", "repairs", "attendance", "bookings"].includes(m) },
  { title: "Finance", match: (m) => ["invoices", "accounts", "cashflow", "contracts", "contracts_inbox"].includes(m) },
  { title: "People", match: (m) => ["my_attendance", "staff_attendance", "leave_management"].includes(m) },
  { title: "Service & admin", match: (m) => ["tickets", "notices", "reviews", "sops", "users", "audit_logs", "client_portal"].includes(m) },
];

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allModules, setAllModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ key: "", label: "", description: "", modules: [] as string[] });

  async function load() {
    const r = await fetch("/api/roles");
    if (r.ok) {
      const j = await r.json();
      setRoles(j.roles);
      setAllModules(j.allModules);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toggle(list: string[], m: string) {
    return list.includes(m) ? list.filter((x) => x !== m) : [...list, m];
  }

  async function create() {
    if (draft.label.trim().length < 2) return;
    setBusy("create");
    setMsg(null);
    try {
      const r = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: draft.key || draft.label,
          label: draft.label.trim(),
          description: draft.description || null,
          modules: draft.modules,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ kind: "ok", text: `Role "${j.label}" created — it now appears in the role dropdown.` });
      setCreating(false);
      setDraft({ key: "", label: "", description: "", modules: [] });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function save(role: Role) {
    setBusy(role.id);
    setMsg(null);
    try {
      const r = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: role.label, description: role.description, modules: role.modules,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ kind: "ok", text: `"${role.label}" saved — access applies within 30 seconds.` });
      setEditing(null);
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(role: Role) {
    if (!confirm(`Delete the role "${role.label}"?`)) return;
    setBusy(role.id);
    setMsg(null);
    try {
      const r = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ kind: "ok", text: `"${role.label}" deleted.` });
      await load();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="card muted">Loading roles…</div>;

  const orphans = roles.filter((r) => !r.builtIn && r.modules.length === 0 && r.userCount > 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-sm text-gray-500">
          A role decides which modules its users can see. Built-in roles can be edited but not
          deleted, and a role in use cannot be removed until its users are moved.
        </p>
        <button onClick={() => setCreating((v) => !v)} className="btn-primary whitespace-nowrap">
          + Create Role
        </button>
      </div>

      {msg && (
        <div className={`mb-3 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      {orphans.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <strong>{orphans.length} role{orphans.length === 1 ? "" : "s"} with no modules assigned.</strong>{" "}
          Users holding {orphans.length === 1 ? "it" : "them"} currently have no access at all:{" "}
          {orphans.map((o) => `${o.label} (${o.userCount})`).join(", ")}. Edit to grant modules.
        </div>
      )}

      {creating && (
        <div className="card mb-4">
          <h3 className="font-medium mb-3">New role</h3>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={draft.label} placeholder="e.g. Housekeeping Supervisor"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div>
              <label className="label">Key (optional)</label>
              <input className="input font-mono text-xs" value={draft.key}
                placeholder={draft.label ? draft.label.toUpperCase().replace(/[^A-Z0-9]+/g, "_") : "AUTO_FROM_NAME"}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Description</label>
            <input className="input" value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <ModulePicker all={allModules} selected={draft.modules}
            onToggle={(m) => setDraft({ ...draft, modules: toggle(draft.modules, m) })}
            onBulk={(ms, on) => setDraft({ ...draft, modules: on
              ? [...new Set([...draft.modules, ...ms])] : draft.modules.filter((x) => !ms.includes(x)) })} />
          <div className="flex gap-2 mt-4">
            <button onClick={create} disabled={busy === "create" || draft.label.trim().length < 2}
              className="btn-primary disabled:opacity-40">
              {busy === "create" ? "Creating…" : "Create role"}
            </button>
            <button onClick={() => setCreating(false)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {roles.map((r) => {
          const isEditing = editing?.id === r.id;
          const draftRole = isEditing ? editing! : r;
          return (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.label}</span>
                    <code className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 font-mono">{r.key}</code>
                    {r.builtIn && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">built-in</span>
                    )}
                    {!r.active && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">inactive</span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                  <div className="text-xs text-gray-500 mt-1">
                    {r.userCount} user{r.userCount === 1 ? "" : "s"} ·{" "}
                    <span className={r.modules.length === 0 ? "text-rose-600 font-medium" : ""}>
                      {r.modules.length} module{r.modules.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setEditing(isEditing ? null : { ...r })}
                    className="text-sm text-brand-600 hover:underline">
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  {!r.builtIn && (
                    <button onClick={() => remove(r)} disabled={busy === r.id}
                      className="text-sm text-red-600 hover:underline disabled:opacity-40">
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Name</label>
                      <input className="input" value={draftRole.label}
                        onChange={(e) => setEditing({ ...draftRole, label: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Description</label>
                      <input className="input" value={draftRole.description ?? ""}
                        onChange={(e) => setEditing({ ...draftRole, description: e.target.value })} />
                    </div>
                  </div>
                  <ModulePicker all={allModules} selected={draftRole.modules}
                    onToggle={(m) => setEditing({ ...draftRole, modules: toggle(draftRole.modules, m) })}
                    onBulk={(ms, on) => setEditing({ ...draftRole, modules: on
                      ? [...new Set([...draftRole.modules, ...ms])]
                      : draftRole.modules.filter((x) => !ms.includes(x)) })} />
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => save(draftRole)} disabled={busy === r.id}
                      className="btn-primary disabled:opacity-40">
                      {busy === r.id ? "Saving…" : "Save changes"}
                    </button>
                    <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModulePicker({
  all, selected, onToggle, onBulk,
}: {
  all: string[]; selected: string[];
  onToggle: (m: string) => void;
  onBulk: (ms: string[], on: boolean) => void;
}) {
  const used = new Set<string>();
  const groups = GROUPS.map((g) => {
    const items = all.filter((m) => !used.has(m) && g.match(m));
    items.forEach((m) => used.add(m));
    return { title: g.title, items };
  }).filter((g) => g.items.length > 0);

  const rest = all.filter((m) => !used.has(m));
  if (rest.length) groups.push({ title: "Other", items: rest });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label mb-0">Modules ({selected.length} selected)</label>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => onBulk(all, true)} className="text-brand-600 hover:underline">Select all</button>
          <button type="button" onClick={() => onBulk(all, false)} className="text-gray-500 hover:underline">Clear</button>
        </div>
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto rounded-lg border p-3">
        {groups.map((g) => {
          const allOn = g.items.every((m) => selected.includes(m));
          return (
            <div key={g.title}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.title}</span>
                <button type="button" onClick={() => onBulk(g.items, !allOn)}
                  className="text-[10px] text-brand-600 hover:underline">
                  {allOn ? "none" : "all"}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1">
                {g.items.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={selected.includes(m)}
                      onChange={() => onToggle(m)} className="rounded" />
                    <span className="truncate">{m.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
