"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";
import ComboBox from "@/components/ComboBox";

const ASSIGN = ["IT", "OPS", "VENDOR"];

export default function RepairsClient({ role, repairs, categories, centers }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [r, setR] = useState<any>({ centerId: "", category: "", description: "", assignedTo: "OPS", cost: 0 });
  const [newCat, setNewCat] = useState("");
  // Local copy of category names so a category added via the combobox appears immediately.
  const [catNames, setCatNames] = useState<string[]>(categories.map((c: any) => c.name));

  // Who may create repair categories: Admin/Owner + Center Manager.
  const canAddCat = role === "ADMIN" || role === "OWNER" || role === "CENTER_MANAGER";

  // Persist a brand-new repair category (admin-only) and select it in the form.
  async function createCategory(name: string): Promise<string | null> {
    const normalized = name.toUpperCase().replace(/\s+/g, "_");
    const res = await fetch("/api/repair-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: normalized }) });
    if (res.ok) {
      setCatNames((prev) => (prev.includes(normalized) ? prev : [...prev, normalized].sort()));
      router.refresh();
      return normalized;
    }
    const j = await res.json().catch(() => ({}));
    alert(j.error || "Could not add category (admin only).");
    return null;
  }

  // Combobox change: if the value is a new category, create it (if allowed) before selecting.
  async function onCategoryChange(val: string) {
    const v = val.trim();
    if (v && !catNames.includes(v) && !catNames.includes(v.toUpperCase().replace(/\s+/g, "_"))) {
      if (!canAddCat) { alert("New categories can only be added by Admin/Owner/Center Manager."); return; }
      const created = await createCategory(v);
      if (created) setR((cur: any) => ({ ...cur, category: created }));
      return;
    }
    setR((cur: any) => ({ ...cur, category: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!r.category.trim()) { alert("Category is required."); return; }
    const res = await fetch("/api/repairs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    if (res.ok) {
      setShow(false);
      setR({ centerId: "", category: "", description: "", assignedTo: "OPS", cost: 0 });
      router.refresh();
    }
  }
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    const normalized = newCat.toUpperCase().replace(/\s+/g, "_");
    const res = await fetch("/api/repair-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: normalized }) });
    if (res.ok) {
      setCatNames((prev) => (prev.includes(normalized) ? prev : [...prev, normalized].sort()));
      setNewCat(""); setShowCat(false); router.refresh();
    } else alert("Failed (admin only)");
  }
  async function resolve(id: string) {
    await fetch(`/api/repairs/${id}/resolve`, { method: "POST" });
    router.refresh();
  }

  // simple analysis
  const byCategory: Record<string, { count: number; cost: number }> = {};
  for (const x of repairs) {
    if (!byCategory[x.category]) byCategory[x.category] = { count: 0, cost: 0 };
    byCategory[x.category].count++;
    byCategory[x.category].cost += x.cost || 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Repairs</h1>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setShow(!show)}>+ Log Repair</button>
          {canAddCat && <button className="btn-ghost" onClick={() => setShowCat(!showCat)}>+ Add Category</button>}
        </div>
      </div>

      {showCat && canAddCat && (
        <form onSubmit={addCat} className="card flex gap-2 items-end">
          <div className="flex-1"><label className="label">Category Name</label><input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. CARPET_REPAIR" /></div>
          <button className="btn-primary">Add</button>
          <button type="button" className="btn-ghost" onClick={() => setShowCat(false)}>Cancel</button>
        </form>
      )}

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Center *</label>
            <select className="input" required value={r.centerId} onChange={(e) => setR({ ...r, centerId: e.target.value })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Category *</label>
            <ComboBox
              value={r.category}
              onChange={onCategoryChange}
              options={catNames}
              placeholder="Select category"
              allowAdd={canAddCat}
            />
            {!canAddCat && <p className="text-xs text-gray-400 mt-0.5">Only Admin/Owner/Center Manager can add new categories.</p>}
          </div>
          <div><label className="label">Assign to</label>
            <select className="input" value={r.assignedTo} onChange={(e) => setR({ ...r, assignedTo: e.target.value })}>
              {ASSIGN.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div><label className="label">Cost (₹)</label><input className="input" type="number" value={r.cost} onChange={(e) => setR({ ...r, cost: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Description *</label><textarea className="input" required rows={2} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Submit</button></div>
        </form>
      )}

      <div className="card">
        <h2 className="h2">Repair analysis by category</h2>
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          {Object.entries(byCategory).map(([k, v]) => (
            <div key={k} className="border rounded-md p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">{k}</div>
              <div className="text-lg font-semibold mt-1">{v.count} jobs · {fmtINR(v.cost)}</div>
            </div>
          ))}
          {Object.keys(byCategory).length === 0 && <p className="muted">No repair data yet.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Center</th><th>Category</th><th>Description</th><th>Assigned</th><th>Cost</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {repairs.map((x: any) => (
              <tr key={x.id}>
                <td>{fmtDate(x.createdAt)}</td>
                <td>{x.center.name}</td>
                <td>{x.category}</td>
                <td>{x.description}</td>
                <td>{x.assignedTo}</td>
                <td>{fmtINR(x.cost || 0)}</td>
                <td>{x.status === "RESOLVED" ? <span className="badge bg-emerald-100 text-emerald-700">Resolved</span> : <span className="badge bg-amber-100 text-amber-700">{x.status}</span>}</td>
                <td>{x.status !== "RESOLVED" && <button className="btn-ghost text-xs" onClick={() => resolve(x.id)}>Mark resolved</button>}</td>
              </tr>
            ))}
            {repairs.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-8">No repairs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
