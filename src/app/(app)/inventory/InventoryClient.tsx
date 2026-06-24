"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR } from "@/lib/utils";
import ComboBox from "@/components/ComboBox";

const INV_CATS = ["TEA_COFFEE", "HOUSEKEEPING", "STATIONERY", "OTHER"];
const ASSET_CATS = ["CHAIR", "DESK", "AC", "LIGHT", "NETWORK_EQUIPMENT", "KITCHEN", "OTHER"];

export default function InventoryClient({ inventory, assets, centers }: any) {
  const router = useRouter();

  // Category suggestions = the known defaults + any category already used by existing items.
  // The field is a searchable combobox: type to filter these, or type a brand-new category.
  const invCategoryOptions = Array.from(
    new Set([...INV_CATS, ...inventory.map((i: any) => i.category).filter(Boolean)]),
  ).sort();
  const [tab, setTab] = useState<"INV" | "ASSET">("INV");
  const [showInv, setShowInv] = useState(false);
  const [showAsset, setShowAsset] = useState(false);
  const [inv, setInv] = useState<any>({ centerId: "", name: "", category: "", unit: "pkts", currentStock: 0, threshold: 0 });
  const [asset, setAsset] = useState<any>({ centerId: "", name: "", category: "CHAIR", serialNo: "", location: "", cost: 0 });

  async function saveInv(e: React.FormEvent) {
    e.preventDefault();
    const category = inv.category.trim();
    if (!category) { alert("Category is required."); return; }
    const r = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...inv, category }) });
    if (r.ok) {
      setShowInv(false);
      setInv({ centerId: "", name: "", category: "", unit: "pkts", currentStock: 0, threshold: 0 });
      router.refresh();
    }
  }
  async function saveAsset(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(asset) });
    if (r.ok) { setShowAsset(false); router.refresh(); }
  }
  async function logConsumption(id: string) {
    const qty = prompt("Quantity consumed:");
    if (!qty) return;
    await fetch(`/api/inventory/${id}/consume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qty: Number(qty) }) });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="h1">Inventory & Assets</h1>
      <div className="flex border-b">
        <button onClick={() => setTab("INV")} className={`px-4 py-2 text-sm border-b-2 ${tab === "INV" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Consumables ({inventory.length})</button>
        <button onClick={() => setTab("ASSET")} className={`px-4 py-2 text-sm border-b-2 ${tab === "ASSET" ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>Assets ({assets.length})</button>
      </div>

      {tab === "INV" && (
        <>
          <button className="btn-primary" onClick={() => setShowInv(!showInv)}>+ Add Item</button>
          {showInv && (
            <form onSubmit={saveInv} className="card grid sm:grid-cols-3 gap-3">
              <div><label className="label">Center *</label>
                <select className="input" required value={inv.centerId} onChange={(e) => setInv({ ...inv, centerId: e.target.value })}>
                  <option value="">— Select —</option>
                  {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Name *</label><input className="input" required value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></div>
              <div><label className="label">Category</label>
                <ComboBox
                  value={inv.category}
                  onChange={(val) => setInv({ ...inv, category: val })}
                  options={invCategoryOptions}
                  placeholder="Select category"
                />
              </div>
              <div><label className="label">Unit</label><input className="input" value={inv.unit} onChange={(e) => setInv({ ...inv, unit: e.target.value })} /></div>
              <div><label className="label">Current Stock</label><input className="input" type="number" value={inv.currentStock} onChange={(e) => setInv({ ...inv, currentStock: Number(e.target.value) })} /></div>
              <div><label className="label">Threshold</label><input className="input" type="number" value={inv.threshold} onChange={(e) => setInv({ ...inv, threshold: Number(e.target.value) })} /></div>
              <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShowInv(false)}>Cancel</button><button className="btn-primary">Save</button></div>
            </form>
          )}
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Item</th><th>Center</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {inventory.map((i: any) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.name}</td>
                    <td>{i.center?.name}</td>
                    <td>{i.category}</td>
                    <td>{i.currentStock} {i.unit}</td>
                    <td>{i.threshold}</td>
                    <td>{i.currentStock <= i.threshold ? <span className="badge bg-rose-100 text-rose-700">LOW</span> : <span className="badge bg-emerald-100 text-emerald-700">OK</span>}</td>
                    <td><button className="btn-ghost text-xs" onClick={() => logConsumption(i.id)}>+ Log consumption</button></td>
                  </tr>
                ))}
                {inventory.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "ASSET" && (
        <>
          <button className="btn-primary" onClick={() => setShowAsset(!showAsset)}>+ Add Asset</button>
          {showAsset && (
            <form onSubmit={saveAsset} className="card grid sm:grid-cols-3 gap-3">
              <div><label className="label">Center *</label>
                <select className="input" required value={asset.centerId} onChange={(e) => setAsset({ ...asset, centerId: e.target.value })}>
                  <option value="">— Select —</option>
                  {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Name *</label><input className="input" required value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} /></div>
              <div><label className="label">Category</label>
                <select className="input" value={asset.category} onChange={(e) => setAsset({ ...asset, category: e.target.value })}>{ASSET_CATS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div><label className="label">Serial No.</label><input className="input" value={asset.serialNo} onChange={(e) => setAsset({ ...asset, serialNo: e.target.value })} /></div>
              <div><label className="label">Location (zone)</label><input className="input" value={asset.location} onChange={(e) => setAsset({ ...asset, location: e.target.value })} /></div>
              <div><label className="label">Cost</label><input className="input" type="number" value={asset.cost} onChange={(e) => setAsset({ ...asset, cost: Number(e.target.value) })} /></div>
              <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShowAsset(false)}>Cancel</button><button className="btn-primary">Save</button></div>
            </form>
          )}
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Center</th><th>Category</th><th>Serial</th><th>Location</th><th>Cost</th><th>Status</th></tr></thead>
              <tbody>
                {assets.map((a: any) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td>{a.center?.name}</td>
                    <td>{a.category}</td>
                    <td>{a.serialNo || "—"}</td>
                    <td>{a.location || "—"}</td>
                    <td>{a.cost ? fmtINR(a.cost) : "—"}</td>
                    <td>{a.status}</td>
                  </tr>
                ))}
                {assets.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No assets</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
