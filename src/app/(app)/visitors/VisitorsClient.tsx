"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Period = "day" | "week" | "month" | "quarter" | "half" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "half", label: "Half Yearly" },
  { value: "year", label: "This Year" },
];

// Start of the given period relative to `now`.
function periodStart(period: Period, now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case "day":
      return d;
    case "week": {
      // Week starts Monday
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return d;
    }
    case "month":
      d.setDate(1);
      return d;
    case "quarter": {
      const q = Math.floor(d.getMonth() / 3);
      return new Date(d.getFullYear(), q * 3, 1);
    }
    case "half": {
      const h = d.getMonth() < 6 ? 0 : 6;
      return new Date(d.getFullYear(), h, 1);
    }
    case "year":
      return new Date(d.getFullYear(), 0, 1);
  }
}

export default function VisitorsClient({ initial, leads, centers, preselectLeadId }: any) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(!!preselectLeadId);
  const [period, setPeriod] = useState<Period>("month");
  const [centerFilter, setCenterFilter] = useState<string>("");

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // Filtered list by selected period + center
  const filtered = useMemo(() => {
    const start = periodStart(period, now).getTime();
    return initial.filter((v: any) => {
      const t = new Date(v.createdAt).getTime();
      if (t < start) return false;
      if (centerFilter && v.centerId !== centerFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, period, centerFilter]);

  // Today's visits grouped by center
  const todayByCenter = useMemo(() => {
    const start = startOfToday.getTime();
    const map = new Map<string, number>();
    let unassigned = 0;
    for (const v of initial) {
      if (new Date(v.createdAt).getTime() < start) continue;
      if (v.centerId) map.set(v.centerId, (map.get(v.centerId) || 0) + 1);
      else unassigned += 1;
    }
    const rows = centers
      .map((c: any) => ({ id: c.id, name: c.name, count: map.get(c.id) || 0 }))
      .filter((r: any) => r.count > 0);
    if (unassigned > 0) rows.push({ id: "", name: "Walk-in / unassigned", count: unassigned });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, centers]);

  const todayTotal = todayByCenter.reduce((s: number, r: any) => s + r.count, 0);
  const [form, setForm] = useState<any>({
    name: "",
    phone: "",
    email: "",
    aadhaar: "",
    pan: "",
    leadId: preselectLeadId || "",
    centerId: "",
    tourTaken: false,
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) {
      setShowForm(false);
      setForm({ name: "", phone: "", email: "", aadhaar: "", pan: "", leadId: "", centerId: "", tourTaken: false, notes: "" });
      router.refresh();
    }
  }

  async function verify(id: string) {
    const r = await fetch(`/api/visitors/${id}/kyc`, { method: "POST" });
    if (r.ok) router.refresh();
    else alert("KYC verification failed");
  }

  const backLead = preselectLeadId ? leads.find((l: any) => l.id === preselectLeadId) : null;

  return (
    <div className="space-y-4">
      {preselectLeadId && (
        <Link href={`/leads/${preselectLeadId}`} className="text-sm text-brand-600">
          ← Back to lead{backLead ? `: ${backLead.name}` : ""}
        </Link>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Visitors / KYC</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ Register Visitor</button>
      </div>

      {/* Today's visits per center */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-semibold">Today&apos;s Visits</h2>
          <span className="badge bg-brand-100 text-brand-700">{todayTotal} total</span>
        </div>
        {todayByCenter.length === 0 ? (
          <p className="text-sm text-gray-400">No visits today.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {todayByCenter.map((r: any) => (
              <div key={r.id || "unassigned"} className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm text-gray-500">{r.name}</div>
                <div className="text-2xl font-semibold">{r.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters: period + center */}
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Period</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Center</label>
          <select className="input" value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}>
            <option value="">All centers</option>
            {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="text-sm text-gray-500 pb-2">
          Showing <span className="font-semibold text-gray-700">{filtered.length}</span> visitor{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><label className="label">Link to Lead</label>
            <select className="input" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">— Walk-in / not linked —</option>
              {leads.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.phone || l.email})</option>)}
            </select>
          </div>
          <div><label className="label">Phone <span className="text-red-500">*</span></label>
            <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div><label className="label">Email <span className="text-red-500">*</span></label>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div><label className="label">Aadhaar</label>
            <input className="input" value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} placeholder="XXXX-XXXX-XXXX" />
          </div>
          <div><label className="label">PAN</label>
            <input className="input" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" />
          </div>
          <div><label className="label">Center</label>
            <select className="input" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="tour" type="checkbox" checked={form.tourTaken} onChange={(e) => setForm({ ...form, tourTaken: e.target.checked })} />
            <label htmlFor="tour" className="text-sm">Tour taken</label>
          </div>
          <div className="sm:col-span-2"><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary">Save Visitor</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>Aadhaar/PAN</th><th>Lead</th><th>Center</th><th>Tour</th><th>KYC</th><th></th></tr></thead>
            <tbody>
              {filtered.map((v: any) => (
                <tr key={v.id}>
                  <td className="text-xs whitespace-nowrap">{new Date(v.createdAt).toLocaleDateString()}</td>
                  <td className="font-medium">{v.name}</td>
                  <td>{v.phone}</td>
                  <td className="text-xs">{v.aadhaar}<br />{v.pan}</td>
                  <td>{v.lead?.name || "—"}</td>
                  <td>{v.center?.name || "—"}</td>
                  <td>{v.tourTaken ? "✅" : "—"}</td>
                  <td>{v.kycVerified ? <span className="badge bg-emerald-100 text-emerald-700">Verified</span> : <span className="badge bg-amber-100 text-amber-700">Pending</span>}</td>
                  <td>
                    {!v.kycVerified && (
                      <button className="btn-ghost text-xs" onClick={() => verify(v.id)}>Verify via DigiLocker</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No visitors for this period</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
