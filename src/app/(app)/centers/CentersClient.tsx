"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CentersClient({ initial, role, myCenterId }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [c, setC] = useState<any>({ name: "", city: "", address: "", totalSeats: 50, openSeats: 0 });
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const isCM = role === "CENTER_MANAGER";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/centers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    if (r.ok) {
      const j = await r.json();
      setShow(false);
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
        {isAdmin && <button className="btn-primary" onClick={() => setShow(!show)}>+ Add Center (basic)</button>}
      </div>

      {isAdmin && (
        <div className="card bg-blue-50 border-blue-200 text-sm">
          <strong>Workflow:</strong> Admin creates the basic center record below. Then the Community Manager opens the center's <em>Setup</em> page to upload floor map, add cabins with photos, capture common-area photos, configure inventory, and assign clients to cabins. Accounts uploads contracts via the Contracts Inbox.
        </div>
      )}

      {show && isAdmin && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">New Center — basic details</h2>
          <div><label className="label">Name *</label><input className="input" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
          <div><label className="label">City *</label><input className="input" required value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} /></div>
          <div><label className="label">Total Seats *</label><input className="input" type="number" required value={c.totalSeats} onChange={(e) => setC({ ...c, totalSeats: Number(e.target.value) })} /></div>
          <div><label className="label">Open / hot-desk seats now</label><input className="input" type="number" value={c.openSeats} onChange={(e) => setC({ ...c, openSeats: Number(e.target.value) })} /></div>
          <p className="muted text-xs sm:col-span-2">Cabins and photos are added by the Community Manager after creation. You can add open seats now or later.</p>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn-primary">Create center</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {initial.map((x: any) => {
          const canSetup = isAdmin || (isCM && myCenterId === x.id);
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
                  {isAdmin && <button className="text-xs text-red-600" onClick={() => del(x.id, x.name)}>Delete</button>}
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
