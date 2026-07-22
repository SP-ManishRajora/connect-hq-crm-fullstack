"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_CATS = ["TEA_COFFEE", "HOUSEKEEPING", "INTERNET", "FURNITURE", "ELECTRICAL", "PLUMBING", "OTHER"];

// Normalise a free-text category to a stable key (uppercase, spaces/dashes → underscore).
const normCat = (s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");

const EMPTY_FORM = { name: "", category: "OTHER", contact: "", email: "", phone: "", gstin: "", panNumber: "", bankDetails: "", rateCardJson: "" };

export default function VendorsClient({ initial, role }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const isAdminOrOwner = role === "ADMIN" || role === "OWNER";

  // Categories added inline this session (persist once a vendor using them is saved).
  const [sessionCats, setSessionCats] = useState<string[]>([]);

  // Searchable combobox state for the category field.
  const [catOpen, setCatOpen] = useState(false);
  const [catQuery, setCatQuery] = useState("");

  // Full category list = defaults ∪ categories already used by vendors ∪ session additions.
  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATS);
    for (const v of initial) if (v.category) set.add(String(v.category));
    for (const c of sessionCats) set.add(c);
    return Array.from(set);
  }, [initial, sessionCats]);

  // Categories matching the current search text.
  const q = catQuery.trim().toUpperCase();
  const matches = q ? categories.filter((c) => c.toUpperCase().includes(q)) : categories;
  // Whether the typed value would be a brand-new category (not an exact match of any existing).
  const typedKey = normCat(catQuery);
  const isNewCat = typedKey.length > 0 && !categories.some((c) => c.toUpperCase() === typedKey);

  function chooseCategory(cat: string) {
    setForm((f: any) => ({ ...f, category: cat }));
    setCatOpen(false);
    setCatQuery("");
  }

  function addTypedCategory() {
    if (!isNewCat) return;
    setSessionCats((prev) => [...prev, typedKey]);
    chooseCategory(typedKey);
  }

  function startEdit(v: any) {
    setEditingId(v.id);
    setForm({
      name: v.name || "",
      category: v.category || "OTHER",
      contact: v.contact || "",
      email: v.email || "",
      phone: v.phone || "",
      gstin: v.gstin || "",
      panNumber: v.panNumber || "",
      bankDetails: v.bankDetails || "",
      rateCardJson: v.rateCardJson || "",
    });
    setShow(true);
  }

  function cancel() {
    setShow(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCatOpen(false);
    setCatQuery("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/vendors/${editingId}` : "/api/vendors";
    const method = editingId ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { cancel(); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
  }
  async function blacklist(id: string, current: boolean) {
    let remarks = "";
    if (!current) {
      remarks = prompt("Reason for blacklisting (will be recorded):") || "";
      if (!remarks) return;
    }
    await fetch(`/api/vendors/${id}/blacklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blacklisted: !current, remarks }) });
    router.refresh();
  }
  async function del(id: string, name: string) {
    if (!confirm(`Delete vendor "${name}" permanently?`)) return;
    const r = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Vendors</h1>
        <button className="btn-primary" onClick={() => { if (show) cancel(); else setShow(true); }}>+ Vendor Onboarding</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">{editingId ? "Edit Vendor" : "Vendor Onboarding Form"}</h2>
          <div><label className="label">Vendor Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="relative"><label className="label">Category *</label>
            <input
              className="input"
              title="Category"
              placeholder="Search or add category…"
              value={catOpen ? catQuery : form.category}
              onFocus={() => { setCatOpen(true); setCatQuery(""); }}
              onChange={(e) => { setCatQuery(e.target.value); setCatOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (matches.length > 0) chooseCategory(matches[0]); else if (isNewCat) addTypedCategory(); }
                if (e.key === "Escape") { setCatOpen(false); setCatQuery(""); }
              }}
              // Delay close so a click on an option registers first.
              onBlur={() => setTimeout(() => setCatOpen(false), 150)}
            />
            {catOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border bg-white shadow-lg">
                {matches.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 ${c === form.category ? "font-medium text-brand-700" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseCategory(c)}
                  >
                    {c}
                  </button>
                ))}
                {matches.length === 0 && !isNewCat && (
                  <div className="px-3 py-2 text-sm text-gray-400">No categories</div>
                )}
                {isNewCat && (
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm border-t bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={addTypedCategory}
                  >
                    + Add new category “<code>{typedKey}</code>”
                  </button>
                )}
              </div>
            )}
          </div>
          <div><label className="label">Contact Person</label><input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">GSTIN</label><input className="input" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
          <div><label className="label">PAN</label><input className="input" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} /></div>
          <div><label className="label">Bank Details</label><input className="input" value={form.bankDetails} onChange={(e) => setForm({ ...form, bankDetails: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Rate Card JSON</label>
            <textarea className="input font-mono text-xs" rows={3} value={form.rateCardJson} onChange={(e) => setForm({ ...form, rateCardJson: e.target.value })} placeholder='[{"item":"Tea pkt","rate":120}]' />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>
            <button className="btn-primary">{editingId ? "Update Vendor" : "Save Vendor"}</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Category</th><th>Contact</th><th>GSTIN</th><th>PAN</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {initial.map((v: any) => (
              <tr key={v.id} className={v.blacklisted ? "bg-rose-50" : ""}>
                <td className="font-medium">{v.name}{v.blacklisted && <div className="text-xs text-rose-700">⛔ {v.blacklistRemarks}</div>}</td>
                <td>{v.category}</td>
                <td>{v.contact} · {v.phone}<div className="text-xs text-gray-500">{v.email}</div></td>
                <td>{v.gstin}</td>
                <td>{v.panNumber}</td>
                <td>{v.blacklisted ? <span className="badge bg-rose-100 text-rose-700">Blacklisted</span> : <span className="badge bg-emerald-100 text-emerald-700">Active</span>}</td>
                <td className="space-x-2 text-xs">
                  {isAdminOrOwner && (
                    <>
                      <button className="text-brand-600" onClick={() => startEdit(v)}>Edit</button>
                      <button className="text-amber-700" onClick={() => blacklist(v.id, v.blacklisted)}>{v.blacklisted ? "Restore" : "Blacklist"}</button>
                      <button className="text-red-600" onClick={() => del(v.id, v.name)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No vendors</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
