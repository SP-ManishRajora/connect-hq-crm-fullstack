"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/utils";

export default function AttendanceClient({ logs, centers }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [a, setA] = useState<any>({ centerId: "", cleanliness: "OK", issuesNote: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) });
    if (r.ok) { setShow(false); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="h1">Daily Center Updates</h1>
          <p className="muted">Cleanliness check + issues — used to alert ops/CM via email.</p>
        </div>
        <button className="btn-primary" onClick={() => setShow(!show)}>+ Submit Today's Update</button>
      </div>
      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-3 gap-3">
          <div><label className="label">Center *</label>
            <select className="input" required value={a.centerId} onChange={(e) => setA({ ...a, centerId: e.target.value })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Cleanliness</label>
            <select className="input" value={a.cleanliness} onChange={(e) => setA({ ...a, cleanliness: e.target.value })}>
              <option>OK</option><option>ISSUE</option>
            </select>
          </div>
          <div className="sm:col-span-3"><label className="label">Issues note</label><textarea className="input" rows={2} value={a.issuesNote} onChange={(e) => setA({ ...a, issuesNote: e.target.value })} /></div>
          <div className="sm:col-span-3 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setShow(false)}>Cancel</button><button className="btn-primary">Submit</button></div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Center</th><th>Reported By</th><th>Cleanliness</th><th>Issues</th></tr></thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id}>
                <td>{fmtDate(l.date)}</td>
                <td>{l.center.name}</td>
                <td>{l.reportedBy?.name}</td>
                <td>{l.cleanliness === "OK" ? <span className="badge bg-emerald-100 text-emerald-700">OK</span> : <span className="badge bg-rose-100 text-rose-700">Issue</span>}</td>
                <td>{l.issuesNote || "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-8">No logs yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
