"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EMPTY_CENTER = { name: "", city: "", address: "", totalSeats: 50, openSeats: 0 };

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}

async function uploadFile(file: File, centerName: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", `centers/${slugify(centerName)}`);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("Upload failed");
  return (await r.json()).path;
}

export default function CentersClient({ initial, role, myCenterId }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [c, setC] = useState<any>(EMPTY_CENTER);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // Center Managers now have full admin-level access to all centers.
  const isAdmin = role === "ADMIN" || role === "OWNER" || role === "CENTER_MANAGER";

  function startEdit(x: any) {
    setEditingId(x.id);
    setC({
      name: x.name || "",
      city: x.city || "",
      address: x.address || "",
      totalSeats: x.totalSeats || 0,
      openSeats: 0,
    });
    setPhotos(x.commonAreaPhotos ? JSON.parse(x.commonAreaPhotos) : []);
    setShow(true);
  }

  function cancel() {
    setShow(false);
    setEditingId(null);
    setC(EMPTY_CENTER);
    setPhotos([]);
  }

  async function handleImageUpload(files: FileList) {
    setUploading(true);
    try {
      const paths = await Promise.all(Array.from(files).map((f) => uploadFile(f, c.name)));
      setPhotos((prev) => [...prev, ...paths]);
    } catch { alert("Image upload failed"); }
    finally { setUploading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const commonAreaPhotos = photos.length ? JSON.stringify(photos) : null;
    if (editingId) {
      const r = await fetch(`/api/centers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: c.name, city: c.city, address: c.address, totalSeats: c.totalSeats, commonAreaPhotos }),
      });
      if (r.ok) { cancel(); router.refresh(); }
      else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
      return;
    }
    const r = await fetch("/api/centers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, commonAreaPhotos }),
    });
    if (r.ok) {
      const j = await r.json();
      cancel();
      router.push(`/centers/${j.id}/setup`);
    } else { const j = await r.json(); alert(j.error || "Failed"); }
  }
  async function del(id: string, name: string) {
    if (!confirm(`Delete center "${name}"?`)) return;
    const r = await fetch(`/api/centers/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh(); else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Centers</h1>
        {isAdmin && <button type="button" className="btn-primary" onClick={() => { if (show) cancel(); else { setEditingId(null); setC(EMPTY_CENTER); setShow(true); } }}>+ Add Center (basic)</button>}
      </div>

      {isAdmin && (
        <div className="card bg-blue-50 border-blue-200 text-sm">
          <strong>Workflow:</strong> Admin creates the basic center record below. Then the Community Manager opens the center's <em>Setup</em> page to upload floor map, add cabins with photos, capture common-area photos, configure inventory, and assign clients to cabins. Accounts uploads contracts via the Contracts Inbox.
        </div>
      )}

      {show && isAdmin && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">{editingId ? "Edit Center" : "New Center — basic details"}</h2>
          <div><label className="label">Name *</label><input className="input" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div><label className="label">City *</label><input className="input" required value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
          <div><label className="label">Total Seats *</label><input className="input" type="number" required value={c.totalSeats} onChange={(e) => setC({ ...c, totalSeats: Number(e.target.value) })} /></div>
          {!editingId && (
            <div><label className="label">Open / hot-desk seats now</label><input aria-label="Open / hot-desk seats" className="input" type="number" value={c.openSeats} onChange={(e) => setC({ ...c, openSeats: Number(e.target.value) })} placeholder="e.g. 10" /></div>
          )}
          {!editingId && (
            <p className="muted text-xs sm:col-span-2">Cabins and photos are added by the Community Manager after creation. You can add open seats now or later.</p>
          )}
          {editingId && (
            <p className="muted text-xs sm:col-span-2">To add / remove seats and cabins, use the center&apos;s <em>Setup</em> page.</p>
          )}
          <div className="sm:col-span-2">
            <label className="label">Common Area Photos</label>
            <label className={`flex items-center gap-2 cursor-pointer w-fit px-3 py-2 rounded border border-dashed border-gray-300 hover:border-brand-500 hover:bg-gray-50 text-sm text-gray-600 transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4-4m0 0l4 4m-4-4v9M20 12a8 8 0 10-16 0" /></svg>
              {uploading ? "Uploading…" : "Choose images"}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading}
                onChange={(e) => e.target.files && handleImageUpload(e.target.files)} />
            </label>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {photos.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt="" className="w-24 h-24 object-cover rounded-lg border shadow-sm" />
                    <button type="button"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      onClick={() => setPhotos(photos.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>
            <button type="submit" className="btn-primary">{editingId ? "Update center" : "Create center"}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {initial.map((x: any) => {
          const canSetup = isAdmin;
          return (
            <div key={x.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{x.name}</h3>
                  <p className="muted text-xs">{x.city} · {x.address || "—"}</p>
                  <p className="muted text-xs mt-1">
                    {x.totalSeats} total seats · {x._count?.seats || 0} placed · {x.cabins?.length || 0} cabins · {x._count?.clients || 0} clients
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {canSetup && <Link href={`/centers/${x.id}/setup`} className="btn-primary text-xs">Setup →</Link>}
                  {isAdmin && <button type="button" className="text-xs text-brand-600" onClick={() => startEdit(x)}>Edit</button>}
                  {isAdmin && <button type="button" className="text-xs text-red-600" onClick={() => del(x.id, x.name)}>Delete</button>}
                </div>
              </div>
              <p className="muted text-xs mt-2">QR portal: <code>/qr/{x.id}</code></p>
            </div>
          );
        })}
        {initial.length === 0 && <p className="muted">No centers yet</p>}
      </div>
    </div>
  );
}
