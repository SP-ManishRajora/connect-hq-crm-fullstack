"use client";
import { useState, useEffect, useRef } from "react";
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

  // === Floor edit (rename + manage plan images with preview) ===
  const [editFloor, setEditFloor] = useState<{ id: string; name: string; plans: string[] } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function startEditFloor(f: any) {
    setEditFloor({ id: f.id, name: f.name || "", plans: f.planImages ? JSON.parse(f.planImages) : [] });
  }

  async function saveEditFloor() {
    if (!editFloor) return;
    if (!editFloor.name.trim()) { alert("Floor name cannot be empty."); return; }
    setSavingEdit(true);
    const r = await fetch(`/api/centers/${center.id}/floors`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ floorId: editFloor.id, name: editFloor.name.trim(), planImages: editFloor.plans }),
    });
    setSavingEdit(false);
    if (r.ok) { setEditFloor(null); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to update floor"); }
  }

  // === Cabin add ===
  const [newCab, setNewCab] = useState<any>({ name: "Cabin", capacity: 6, qty: 6, floorId: "", notes: "", photos: [] as string[] });
  const [cabinDetailsId, setCabinDetailsId] = useState<string | null>(null); // which cabin's details are expanded
  const [newCabinId, setNewCabinId] = useState<string | null>(null); // just-added cabin, highlighted briefly
  const newCabinRef = useRef<HTMLDivElement | null>(null);

  // Scroll the just-added cabin into view and clear the highlight after a few seconds.
  useEffect(() => {
    if (!newCabinId) return;
    newCabinRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setNewCabinId(null), 4000);
    return () => clearTimeout(t);
  }, [newCabinId]);

  // === Cabin edit ===
  const [editCab, setEditCab] = useState<any>(null); // { id, name, capacity, floorId, notes, photos[] } or null
  const [savingCab, setSavingCab] = useState(false);

  function startEditCabin(c: any) {
    setCabinDetailsId(null);
    setEditCab({
      id: c.id,
      name: c.name || "",
      capacity: c.seats.length,
      floorId: c.floorId || "",
      notes: c.notes || "",
      photos: c.photos ? JSON.parse(c.photos) : [],
    });
  }

  async function saveEditCabin() {
    if (!editCab) return;
    if (!editCab.name.trim()) { alert("Cabin name cannot be empty."); return; }
    setSavingCab(true);
    const r = await fetch(`/api/centers/${center.id}/cabins`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cabinId: editCab.id, name: editCab.name.trim(), capacity: Number(editCab.capacity),
        floorId: editCab.floorId || null, notes: editCab.notes, photos: editCab.photos,
      }),
    });
    setSavingCab(false);
    if (r.ok) { setEditCab(null); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to update cabin"); }
  }
  async function addCabin(e: React.FormEvent) {
    e.preventDefault();
    // Qty = seats in this cabin → create ONE cabin whose capacity is that seat count.
    const seats = Number(newCab.qty);
    if (!newCab.name?.trim()) { alert("Name is required."); return; }
    if (!seats || seats < 1) { alert("Qty (seats) must be at least 1."); return; }
    const r = await fetch(`/api/centers/${center.id}/cabins`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCab.name, capacity: seats, qty: 1, floorId: newCab.floorId, photos: newCab.photos }),
    });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const created = j.cabins?.[0];
      setNewCab({ name: "Cabin", capacity: 6, qty: 6, floorId: "", notes: "", photos: [] });
      if (created?.id) setNewCabinId(created.id);
      alert(`Cabin "${created?.name || newCab.name}" added.`);
      router.refresh();
    }
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
                const isEditing = editFloor?.id === f.id;
                return (
                  <div key={f.id} className="border rounded-md p-3">
                    {isEditing ? (
                      /* ---- Edit mode: rename + manage plan images with preview ---- */
                      <div className="space-y-2">
                        <div>
                          <label className="label text-xs">Floor name <span className="text-rose-500">*</span></label>
                          <input className="input" value={editFloor!.name} title="Floor name"
                            onChange={(e) => setEditFloor({ ...editFloor!, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="label text-xs">Floor plan(s) — image or PDF <span className="muted">(optional)</span></label>
                          <input type="file" accept="image/*,application/pdf" multiple onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            const ps = await Promise.all(files.map((file) => uploadFile(file, "floors")));
                            setEditFloor((cur) => cur ? ({ ...cur, plans: [...cur.plans, ...ps] }) : cur);
                          }} />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {editFloor!.plans.map((p, i) => (
                              <div key={i} className="relative">
                                <PlanThumb src={p} size="w-20 h-20" onClick={() => setPreview(p)} alt={`plan ${i + 1}`} />
                                <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                                  onClick={() => setEditFloor((cur) => cur ? ({ ...cur, plans: cur.plans.filter((_, k) => k !== i) }) : cur)}>×</button>
                              </div>
                            ))}
                            {editFloor!.plans.length === 0 && <span className="text-xs muted">No plan uploaded</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={savingEdit || !editFloor!.name.trim()} onClick={saveEditFloor}>
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button type="button" className="btn-ghost text-sm" onClick={() => setEditFloor(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      /* ---- View mode ---- */
                      <>
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{f.name} <span className="muted text-xs">(level {f.level})</span></div>
                          <div className="flex gap-3">
                            <button type="button" className="text-brand-600 text-xs" onClick={() => startEditFloor(f)}>Edit</button>
                            <button type="button" className="text-red-500 text-xs" onClick={() => deleteFloor(f.id)}>Delete</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {plans.map((p, i) => (
                            <PlanThumb key={i} src={p} size="w-24 h-24" onClick={() => setPreview(p)} alt={`${f.name} plan ${i + 1}`} />
                          ))}
                          {plans.length === 0 && <span className="text-xs muted">No plan uploaded</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {floors.length === 0 && <p className="muted text-sm">No floors added yet.</p>}
            </div>

            {/* Add a floor */}
            <div className="border border-dashed rounded-md p-3 mt-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">Add a floor</p>
              <div>
                <label className="label text-xs">Floor name <span className="text-rose-500">*</span></label>
                <input
                  className="input"
                  placeholder="Floor name (e.g. Ground, 1st Floor)"
                  value={newFloor.name}
                  onChange={(e) => setNewFloor({ ...newFloor, name: e.target.value })}
                />
              </div>
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
                disabled={savingFloor || !newFloor.name.trim()}
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
          <form onSubmit={addCabin} className="card grid sm:grid-cols-6 gap-3">
            <h2 className="h2 sm:col-span-6">Add cabin</h2>
            <div className="sm:col-span-2"><label className="label">Name *</label><input className="input" required value={newCab.name} onChange={(e) => setNewCab({ ...newCab, name: e.target.value })} placeholder="e.g. 6-Seater Cabin" /></div>
            <div><label className="label">Qty (seats) *</label><input className="input" type="number" min="1" required value={newCab.qty} onChange={(e) => setNewCab({ ...newCab, qty: Number(e.target.value) })} /></div>
            <div><label className="label">Floor <span className="muted">(optional)</span></label>
              <select className="input" title="Floor" value={newCab.floorId} onChange={(e) => setNewCab({ ...newCab, floorId: e.target.value })}>
                <option value="">— None —</option>
                {floors.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="label">Photos</label>
              <input type="file" accept="image/*" multiple onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                const ps = await Promise.all(files.map((f) => uploadFile(f, "cabins")));
                setNewCab({ ...newCab, photos: [...newCab.photos, ...ps] });
              }} />
              <div className="flex flex-wrap gap-1 mt-1">{newCab.photos.map((p: string, i: number) => <img key={i} src={p} className="w-12 h-12 object-cover rounded border" alt="" />)}</div>
            </div>
            <div className="sm:col-span-6 flex items-center justify-between gap-3">
              <p className="muted text-xs">
                <strong>Qty</strong> = seats in this cabin. Creating it uses <strong>{Number(newCab.qty) || 0}</strong> of the center&apos;s <strong>{remainingSeats}</strong> unallocated seats → <strong>{remainingSeats - (Number(newCab.qty) || 0)}</strong> left.
              </p>
              <button className="btn-primary" disabled={!newCab.name?.trim() || Number(newCab.qty) < 1}>Add</button>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {cabins.map((c: any) => {
              const photos: string[] = c.photos ? JSON.parse(c.photos) : [];
              const occSeats = c.seats.filter((s: any) => s.occupied).length;
              const unusedSeats = c.seats.filter((s: any) => s.partialOccupancy).length;
              const freeSeats = c.seats.length - occSeats - unusedSeats;
              const floorName = c.floorId ? (floors.find((f: any) => f.id === c.floorId)?.name || null) : null;
              // Assigned client(s): distinct clients referenced by this cabin's seats.
              const clientIds = Array.from(new Set(c.seats.map((s: any) => s.assignedClientId).filter(Boolean)));
              const assignedNames = clientIds
                .map((id: any) => clients.find((cl: any) => cl.id === id)?.companyName)
                .filter(Boolean);
              const isOpen = cabinDetailsId === c.id;
              const isEditing = editCab?.id === c.id;
              if (isEditing) {
                return (
                  <div key={c.id} className="card space-y-2">
                    <div className="font-medium text-sm">Edit cabin</div>
                    <div><label className="label text-xs">Name <span className="text-rose-500">*</span></label>
                      <input className="input" title="Cabin name" value={editCab.name} onChange={(e) => setEditCab({ ...editCab, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="label text-xs">Capacity (seats)</label>
                        <input className="input" type="number" min="1" title="Capacity" value={editCab.capacity} onChange={(e) => setEditCab({ ...editCab, capacity: Number(e.target.value) })} />
                      </div>
                      <div><label className="label text-xs">Floor</label>
                        <select className="input" title="Floor" value={editCab.floorId} onChange={(e) => setEditCab({ ...editCab, floorId: e.target.value })}>
                          <option value="">— None —</option>
                          {floors.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div><label className="label text-xs">Notes</label>
                      <textarea className="input" rows={2} title="Notes" value={editCab.notes} onChange={(e) => setEditCab({ ...editCab, notes: e.target.value })} />
                    </div>
                    <div><label className="label text-xs">Photos</label>
                      <input type="file" accept="image/*" multiple onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (!files.length) return;
                        const ps = await Promise.all(files.map((f) => uploadFile(f, "cabins")));
                        setEditCab((cur: any) => ({ ...cur, photos: [...cur.photos, ...ps] }));
                      }} />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editCab.photos.map((p: string, i: number) => (
                          <div key={i} className="relative">
                            <img src={p} className="w-16 h-16 object-cover rounded border cursor-pointer" alt="" onClick={() => setPreview(p)} />
                            <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                              onClick={() => setEditCab((cur: any) => ({ ...cur, photos: cur.photos.filter((_: string, k: number) => k !== i) }))}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="muted text-xs">Changing capacity adds/removes auto-created seats. Occupied seats are never removed.</p>
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary text-sm disabled:opacity-50" disabled={savingCab || !editCab.name.trim()} onClick={saveEditCabin}>
                        {savingCab ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className="btn-ghost text-sm" onClick={() => setEditCab(null)}>Cancel</button>
                    </div>
                  </div>
                );
              }
              const isNew = newCabinId === c.id;
              return (
                <div
                  key={c.id}
                  ref={isNew ? newCabinRef : undefined}
                  className={`card transition-all duration-500 ${isNew ? "ring-2 ring-brand-500 bg-brand-50 shadow-lg" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="font-medium">{c.name} {isNew && <span className="badge bg-brand-100 text-brand-700 text-[10px] align-middle">NEW</span>} <span className="text-xs text-gray-500">cap {c.capacity} · {c.seats.length} seats</span></div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-ghost text-xs" onClick={() => startEditCabin(c)}>Edit</button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => setCabinDetailsId(isOpen ? null : c.id)}>
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    </div>
                  </div>
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">{photos.map((p, i) => <img key={i} src={p} className="w-16 h-16 object-cover rounded border cursor-pointer" alt="" onClick={() => setPreview(p)} />)}</div>
                  )}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t text-sm space-y-1">
                      <div><span className="muted">Capacity:</span> {c.capacity} seats</div>
                      <div><span className="muted">Seats created:</span> {c.seats.length}</div>
                      <div><span className="muted">Floor:</span> {floorName || "—"}</div>
                      <div><span className="muted">Occupied:</span> {occSeats} · <span className="muted">Unused (½ price):</span> {unusedSeats} · <span className="muted">Free:</span> {freeSeats}</div>
                      <div><span className="muted">Assigned client{assignedNames.length > 1 ? "s" : ""}:</span> {assignedNames.length ? assignedNames.join(", ") : "—"}</div>
                      <div><span className="muted">Notes:</span> {c.notes || "—"}</div>
                    </div>
                  )}
                </div>
              );
            })}
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
