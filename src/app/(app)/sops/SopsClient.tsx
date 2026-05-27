"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CATS = ["ONBOARDING", "OPS", "IT", "HR", "OTHER"];

export default function SopsClient({ initial }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("");
  const [s, setS] = useState<any>({ title: "", body: "", category: "OPS" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/sops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    if (r.ok) { setShow(false); router.refresh(); }
  }

  const filtered = initial.filter((x: any) => !filter || x.title.toLowerCase().includes(filter.toLowerCase()) || x.body.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">SOPs Library</h1>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Add SOP</button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Title *</label><input className="input" required value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={s.category} onChange={(e) => setS({ ...s, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="label">Body *</label><textarea className="input" required rows={6} value={s.body} onChange={(e) => setS({ ...s, body: e.target.value })} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Save SOP</button></div>
        </form>
      )}

      <input className="input max-w-md" placeholder="Search SOPs..." value={filter} onChange={(e) => setFilter(e.target.value)} />

      <div className="space-y-3">
        {filtered.map((x: any) => (
          <div key={x.id} className="card">
            <div className="flex justify-between">
              <h3 className="font-semibold">{x.title}</h3>
              <span className="badge bg-blue-100 text-blue-700">{x.category}</span>
            </div>
            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{x.body}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="muted">No SOPs match.</p>}
      </div>
    </div>
  );
}
