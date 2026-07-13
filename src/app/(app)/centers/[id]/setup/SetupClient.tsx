"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const INV_CATS = ["TEA_COFFEE", "HOUSEKEEPING", "STATIONERY", "OTHER"];

async function uploadFile(file: File, folder: string): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("folder", folder);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`Upload failed (HTTP ${r.status})`);
  const j = await r.json(); return j.path;
}

const isPdf = (p: string) => /\.pdf($|\?)/i.test(p);

// A floor-plan thumbnail that renders an image OR a PDF chip. size = tailwind w/h class.
function PlanThumb({ src, size, onClick, alt }: { src: string; size: string; onClick?: () => void; alt?: string }) {
  if (isPdf(src)) {
    return (
      <button type="button" onClick={onClick} title="Preview PDF" className={`${size} rounded border bg-rose-50 text-rose-600 flex flex-col items-center justify-center gap-0.5 hover:ring-2 hover:ring-brand-500 transition`}>
        <span className="text-lg">📄</span>
        <span className="text-[9px] font-medium">PDF</span>
      </button>
    );
  }
  return <img src={src} className={`${size} object-cover rounded border cursor-zoom-in hover:ring-2 hover:ring-brand-500 transition`} alt={alt || ""} onClick={onClick} title="Click to preview" />;
}

export default function SetupClient({ center, cabins, openSeats, inventory, clients, floors = [] }: any) {
  const router = useRouter();
  const [tab, setTab] = useState<"MAP" | "CABINS" | "ASSIGN" | "INVENTORY">("MAP");

  // === Floor map + common-area photos ===
  const [mapImage, setMapImage] = useState<string>(center.mapImagePath || "");
  const [commonAreaPhotos, setCommonAreaPhotos] = useState<string[]>(center.commonAreaPhotos ? JSON.parse(center.commonAreaPhotos) : []);

  async function saveMapAndCommon() {
    const r = await fetch(`/api/centers/${center.id}/setup`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapImagePath: mapImage || null, commonAreaPhotos }),
    });
    if (r.ok) { alert("Saved"); router.refresh(); }
  }

  // === Floors (each requires at least one floor plan) ===
  const [newFloor, setNewFloor] = useState<{ name: string; plans: string[] }>({ name: "", plans: [] });
  const [savingFloor, setSavingFloor] = useState(false);
  const [preview, setPreview] = useState<string | null>(null); // full-size floor-plan lightbox

  async function addFloor() {
    if (!newFloor.name.trim()) { alert("Enter a floor name."); return; }
    setSavingFloor(true);
    const r = await fetch(`/api/centers/${center.id}/floors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFloor.name.trim(), planImages: newFloor.plans }),
    });
    setSavingFloor(false);
    if (r.ok) { setNewFloor({ name: "", plans: [] }); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to add floor"); }
  }

  async function deleteFloor(floorId: string) {
    if (!confirm("Delete this floor? Its plan images will be removed.")) return;
    const r = await fetch(`/api/centers/${center.id}/floors?floorId=${floorId}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to delete floor"); }
  }

  // === Cabin add ===
  const [newCab, setNewCab] = useState<any>({ name: "Cabin", capacity: 6, qty: 1, photos: [] as string[] });
  async function addCabin(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/centers/${center.id}/cabins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCab) });
    if (r.ok) { setNewCab({ name: "Cabin", capacity: 6, qty: 1, photos: [] }); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  // === Seat assignment ===
  const [assignCabinId, setAssignCabinId] = useState("");
  const [assignClientId, setAssignClientId] = useState("");
  const [assignOcc, setAssignOcc] = useState(0);
  const selectedCabin = cabins.find((c: any) => c.id === assignCabinId);
  async function doAssign(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/centers/${center.id}/assign-cabin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cabinId: assignCabinId, clientId: assignClientId, occupiedSeats: assignOcc }) });
    if (r.ok) { setAssignCabinId(""); setAssignClientId(""); setAssignOcc(0); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }
  async function clearCabin(cabinId: string, label: string) {
    if (!confirm(`Clear cabin "${label}" assignment?`)) return;
    const r = await fetch(`/api/centers/${center.id}/assign-cabin`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cabinId }) });
    if (r.ok) router.refresh();
  }

  // === Inventory ===
  const [inv, setInv] = useState<any>({ name: "", category: "TEA_COFFEE", unit: "pkts", currentStock: 0, threshold: 0 });
  async function addInv(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...inv, centerId: center.id }) });
    if (r.ok) { setInv({ name: "", category: "TEA_COFFEE", unit: "pkts", currentStock: 0, threshold: 0 }); router.refresh(); }
  }

  const placedSeats = cabins.reduce((s: number, c: any) => s + c.seats.length, 0) + openSeats.length;
  const remainingSeats = center.totalSeats - placedSeats;

  return (
    <div className="space-y-4">
      <Link href="/centers" className="text-sm text-brand-600">← Back to centers</Link>
      <div>
        <h1 className="h1">Setup: {center.name}</h1>
        <p className="muted text-sm">{center.city} · {center.address}</p>
        <p className="muted text-sm">
          {placedSeats}/{center.totalSeats} seats placed · {cabins.length} cabin{cabins.length === 1 ? "" : "s"} · {openSeats.length} open seat{openSeats.length === 1 ? "" : "s"}
          {remainingSeats > 0 && <span className="text-amber-700"> · {remainingSeats} seats still to allocate</span>}
        </p>
      </div>

      <div className="flex border-b">
        {[
          ["MAP", "📷 Map & Common Areas"],
          ["CABINS", "🚪 Cabins"],
          ["ASSIGN", "👥 Assign Cabins to Clients"],
          ["INVENTORY", "📦 Inventory"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm border-b-2 ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "MAP" && (
        <div className="card space-y-4">
          <div>
            <label className="label">Floor Map (PNG/JPG)</label>
            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setMapImage(await uploadFile(f, "centers")); }} />
            {mapImage && <img src={mapImage} className="mt-2 max-w-full rounded border" alt="floor map" />}
          </div>

          {/* Floors — each floor requires at least one floor plan image */}
          <div className="border-t pt-4">
            <label className="label">Floors</label>
            <p className="muted text-xs mb-2">Add each floor of this center. A floor-plan image is optional — you can add it later.</p>

            {/* Existing floors */}
            <div className="space-y-3">
              {floors.map((f: any) => {
                const plans: string[] = f.planImages ? JSON.parse(f.planImages) : [];
                return (
                  <div key={f.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{f.name} <span className="muted text-xs">(level {f.level})</span></div>
                      <button type="button" className="text-red-500 text-xs" onClick={() => deleteFloor(f.id)}>Delete</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {plans.map((p, i) => (
                        <PlanThumb key={i} src={p} size="w-24 h-24" onClick={() => setPreview(p)} alt={`${f.name} plan ${i + 1}`} />
                      ))}
                      {plans.length === 0 && <span className="text-xs muted">No plan uploaded</span>}
                    </div>
                  </div>
                );
              })}
              {floors.length === 0 && <p className="muted text-sm">No floors added yet.</p>}
            </div>

            {/* Add a floor */}
            <div className="border border-dashed rounded-md p-3 mt-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">Add a floor</p>
              <input
                className="input"
                placeholder="Floor name (e.g. Ground, 1st Floor)"
                value={newFloor.name}
                onChange={(e) => setNewFloor({ ...newFloor, name: e.target.value })}
              />
              <div>
                <label className="label text-xs">Floor plan(s) — image or PDF <span className="muted">(optional)</span></label>
                <input type="file" accept="image/*,application/pdf" multiple onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  const ps = await Promise.all(files.map((f) => uploadFile(f, "floors")));
                  setNewFloor((cur) => ({ ...cur, plans: [...cur.plans, ...ps] }));
                }} />
                <div className="flex flex-wrap gap-2 mt-2">
                  {newFloor.plans.map((p, i) => (
                    <div key={i} className="relative">
                      <PlanThumb src={p} size="w-20 h-20" onClick={() => setPreview(p)} />
                      <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs" onClick={() => setNewFloor((cur) => ({ ...cur, plans: cur.plans.filter((_, k) => k !== i) }))}>×</button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn-primary text-sm disabled:opacity-50"
                disabled={savingFloor || !newFloor.name.trim() || newFloor.plans.length < 1}
                onClick={addFloor}
              >
                {savingFloor ? "Adding…" : "Add Floor"}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Common area photos</label>
            <input type="file" accept="image/*" multiple onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              const ps = await Promise.all(files.map((f) => uploadFile(f, "centers")));
              setCommonAreaPhotos([...commonAreaPhotos, ...ps]);
            }} />
            <div className="flex flex-wrap gap-2 mt-2">
              {commonAreaPhotos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p} className="w-24 h-24 object-cover rounded border" alt="" />
                  <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs" onClick={() => setCommonAreaPhotos(commonAreaPhotos.filter((_, k) => k !== i))}>×</button>
                </div>
              ))}
            </div>
          </div>
          <div><button className="btn-primary" onClick={saveMapAndCommon}>Save</button></div>
          <p className="muted text-xs">These photos auto-attach to outbound proposals.</p>
        </div>
      )}

      {tab === "CABINS" && (
        <div className="space-y-4">
          <form onSubmit={addCabin} className="card grid sm:grid-cols-5 gap-3">
            <h2 className="h2 sm:col-span-5">Add cabin(s)</h2>
            <div><label className="label">Name</label><input className="input" value={newCab.name} onChange={(e) => setNewCab({ ...newCab, name: e.target.value })} placeholder="e.g. 6-Seater Cabin" /></div>
            <div><label className="label">Capacity</label><input className="input" type="number" value={newCab.capacity} onChange={(e) => setNewCab({ ...newCab, capacity: Number(e.target.value) })} /></div>
            <div><label className="label">Qty</label><input className="input" type="number" value={newCab.qty} onChange={(e) => setNewCab({ ...newCab, qty: Number(e.target.value) })} /></div>
            <div className="sm:col-span-2"><label className="label">Photos</label>
              <input type="file" accept="image/*" multiple onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                const ps = await Promise.all(files.map((f) => uploadFile(f, "cabins")));
                setNewCab({ ...newCab, photos: [...newCab.photos, ...ps] });
              }} />
              <div className="flex flex-wrap gap-1 mt-1">{newCab.photos.map((p: string, i: number) => <img key={i} src={p} className="w-12 h-12 object-cover rounded border" alt="" />)}</div>
            </div>
            <div className="sm:col-span-5 flex justify-end"><button className="btn-primary">Add</button></div>
            <p className="muted text-xs sm:col-span-5">Tip: create groups, e.g. <code>Cabin</code> × cap 6 × qty 3 = 3 cabins × 6 seats. Seats are auto-created (S-numbered).</p>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cabins.map((c: any) => (
              <div key={c.id} className="card">
                <div className="font-medium">{c.name} <span className="text-xs text-gray-500">cap {c.capacity} · {c.seats.length} seats</span></div>
                {c.photos && (
                  <div className="flex flex-wrap gap-1 mt-2">{(JSON.parse(c.photos) as string[]).map((p, i) => <img key={i} src={p} className="w-16 h-16 object-cover rounded border" alt="" />)}</div>
                )}
              </div>
            ))}
            {cabins.length === 0 && <p className="muted">No cabins yet</p>}
          </div>
        </div>
      )}

      {tab === "ASSIGN" && (
        <div className="space-y-4">
          <form onSubmit={doAssign} className="card grid sm:grid-cols-4 gap-3">
            <h2 className="h2 sm:col-span-4">Assign a client to a cabin</h2>
            <div><label className="label">Cabin *</label>
              <select className="input" required value={assignCabinId} onChange={(e) => setAssignCabinId(e.target.value)}>
                <option value="">— Select —</option>
                {cabins.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.seats.length})</option>)}
              </select>
            </div>
            <div><label className="label">Client *</label>
              <select className="input" required value={assignClientId} onChange={(e) => setAssignClientId(e.target.value)}>
                <option value="">— Select —</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </div>
            <div><label className="label">Occupied seats *</label>
              <input className="input" type="number" min={0} max={selectedCabin?.capacity || 100} required value={assignOcc} onChange={(e) => setAssignOcc(Number(e.target.value))} />
              {selectedCabin && <p className="muted text-xs">of {selectedCabin.capacity}</p>}
            </div>
            <div className="flex items-end"><button className="btn-primary w-full">Assign</button></div>
            <p className="muted text-xs sm:col-span-4">Unused cabin seats are coloured orange on the seat map and billed at 50% on the next invoice run.</p>
          </form>

          <div className="card">
            <h2 className="h2">Current assignments</h2>
            <table className="table mt-2">
              <thead><tr><th>Cabin</th><th>Capacity</th><th>Occupied / Partial</th><th>Empty</th><th></th></tr></thead>
              <tbody>
                {cabins.map((c: any) => {
                  const occ = c.seats.filter((s: any) => s.occupied).length;
                  const partial = c.seats.filter((s: any) => s.partialOccupancy).length;
                  const empty = c.seats.length - occ - partial;
                  return (
                    <tr key={c.id}>
                      <td className="font-medium">{c.name}</td>
                      <td>{c.capacity}</td>
                      <td>{occ} occupied · {partial} unused (½ price)</td>
                      <td>{empty}</td>
                      <td>{(occ > 0 || partial > 0) && <button className="text-xs text-red-600" onClick={() => clearCabin(c.id, c.name)}>Clear</button>}</td>
                    </tr>
                  );
                })}
                {cabins.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No cabins to assign</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "INVENTORY" && (
        <div className="space-y-4">
          <form onSubmit={addInv} className="card grid sm:grid-cols-5 gap-3">
            <h2 className="h2 sm:col-span-5">Add inventory item</h2>
            <div><label className="label">Name *</label><input className="input" required value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></div>
            <div><label className="label">Category</label>
              <select className="input" value={inv.category} onChange={(e) => setInv({ ...inv, category: e.target.value })}>{INV_CATS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div><label className="label">Unit</label><input className="input" value={inv.unit} onChange={(e) => setInv({ ...inv, unit: e.target.value })} /></div>
            <div><label className="label">Stock</label><input className="input" type="number" value={inv.currentStock} onChange={(e) => setInv({ ...inv, currentStock: Number(e.target.value) })} /></div>
            <div><label className="label">Threshold</label><input className="input" type="number" value={inv.threshold} onChange={(e) => setInv({ ...inv, threshold: Number(e.target.value) })} /></div>
            <div className="sm:col-span-5 flex justify-end"><button className="btn-primary">Add</button></div>
          </form>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Status</th></tr></thead>
              <tbody>
                {inventory.map((i: any) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.name}</td>
                    <td>{i.category}</td>
                    <td>{i.currentStock} {i.unit}</td>
                    <td>{i.threshold}</td>
                    <td>{i.currentStock <= i.threshold ? <span className="badge bg-rose-100 text-rose-700">LOW</span> : <span className="badge bg-emerald-100 text-emerald-700">OK</span>}</td>
                  </tr>
                ))}
                {inventory.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No inventory yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floor-plan full-size preview (lightbox) — image or PDF */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          {isPdf(preview) ? (
            <div className="w-full h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <iframe src={preview} title="floor plan PDF" className="w-full h-full rounded bg-white" />
              <a href={preview} target="_blank" rel="noreferrer" className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm underline">Open PDF in new tab</a>
            </div>
          ) : (
            <img src={preview} className="max-w-full max-h-full rounded shadow-lg" alt="floor plan preview" />
          )}
          <button type="button" className="absolute top-4 right-4 text-white text-2xl leading-none" onClick={() => setPreview(null)}>×</button>
        </div>
      )}
    </div>
  );
}
