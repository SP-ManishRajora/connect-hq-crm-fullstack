"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/utils";

export default function NoticesClient({ initial, centers }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [n, setN] = useState<any>({ title: "", body: "", isAd: false, brand: "", centerId: "", endDate: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) });
    if (r.ok) { setShow(false); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Notice Board / Brand Ads</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Add Notice / Ad</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">Title *</label><input className="input" required value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Body *</label><textarea className="input" required rows={3} value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} /></div>
          <div><label className="label">Center</label>
            <select className="input" value={n.centerId} onChange={(e) => setN({ ...n, centerId: e.target.value })}>
              <option value="">All centers</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">End date</label><input className="input" type="date" value={n.endDate} onChange={(e) => setN({ ...n, endDate: e.target.value })} /></div>
          <div className="flex items-center gap-2"><input id="isAd" type="checkbox" checked={n.isAd} onChange={(e) => setN({ ...n, isAd: e.target.checked })} /><label htmlFor="isAd" className="text-sm">This is a paid Brand Ad</label></div>
          <div><label className="label">Brand</label><input className="input" value={n.brand} onChange={(e) => setN({ ...n, brand: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Publish</button></div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {initial.map((x: any) => (
          <div key={x.id} className={`card ${x.isAd ? "border-amber-300 bg-amber-50" : ""}`}>
            <div className="flex justify-between items-start">
              <h3 className="font-semibold">{x.title}</h3>
              {x.isAd ? <span className="badge bg-amber-200 text-amber-900">Ad: {x.brand}</span> : null}
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap">{x.body}</p>
            <p className="muted text-xs mt-2">{x.center?.name || "All centers"} · {fmtDate(x.startDate)}{x.endDate && ` → ${fmtDate(x.endDate)}`}</p>
          </div>
        ))}
        {initial.length === 0 && <p className="muted">No notices yet</p>}
      </div>
    </div>
  );
}
