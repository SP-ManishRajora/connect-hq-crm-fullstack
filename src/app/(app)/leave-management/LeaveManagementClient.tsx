"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["CASUAL", "SICK", "PAID", "UNPAID", "OTHER"];
const STATUS_TABS = ["PENDING", "APPROVED", "REJECTED", "ALL"];

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MOY = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d: string) {
  const dt = new Date(d);
  return `${DOW[dt.getDay()]}, ${dt.getDate()} ${MOY[dt.getMonth()]}`;
}
function daysInclusive(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

const statusColor: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-gray-100 text-gray-700",
};

export default function LeaveManagementClient({ requests, users, statusFilter }: any) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ userId: "", startDate: "", endDate: "", type: "CASUAL", reason: "" });

  function setStatusTab(s: string) {
    const params = new URLSearchParams();
    if (s !== "PENDING") params.set("status", s);
    router.push(`/leave-management${params.toString() ? "?" + params.toString() : ""}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      setShowForm(false);
      setForm({ userId: "", startDate: "", endDate: "", type: "CASUAL", reason: "" });
      router.refresh();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j.error || "Failed");
    }
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const notes = decision === "REJECTED" ? (prompt("Reason for rejection (optional):") || "") : "";
    setBusyId(id);
    try {
      const r = await fetch(`/api/leave-requests/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      if (r.ok) router.refresh();
      else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed"); }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Leave Management</h1>
        <button type="button" className="btn-primary" onClick={() => setShowForm(!showForm)}>+ Record Leave (on behalf)</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <h2 className="h2 sm:col-span-2">Record leave request</h2>
          <div className="sm:col-span-2">
            <label className="label">Employee *</label>
            <select className="input" required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">— Select —</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} — {u.email} ({u.role})</option>)}
            </select>
          </div>
          <div><label className="label">Start date *</label>
            <input aria-label="Start date" type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div><label className="label">End date *</label>
            <input aria-label="End date" type="date" className="input" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div><label className="label">Type *</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="label">Reason</label>
            <textarea className="input" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save Request</button>
          </div>
        </form>
      )}

      <div className="flex border-b">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusTab(s)}
            className={`px-4 py-2 text-sm border-b-2 ${statusFilter === s ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Decided By</th><th></th></tr>
          </thead>
          <tbody>
            {requests.map((r: any) => (
              <tr key={r.id}>
                <td className="font-medium">{r.user.name}<div className="text-xs text-gray-500">{r.user.email}</div></td>
                <td><span className="badge bg-gray-100 text-gray-700">{r.type}</span></td>
                <td>{fmtDate(r.startDate)}</td>
                <td>{fmtDate(r.endDate)}</td>
                <td>{daysInclusive(r.startDate, r.endDate)}</td>
                <td className="text-xs max-w-xs truncate" title={r.reason || ""}>{r.reason || "—"}</td>
                <td><span className={`badge ${statusColor[r.status] || "bg-gray-100"}`}>{r.status}</span></td>
                <td className="text-xs">{r.decidedBy?.name || "—"}{r.notes && <div className="text-gray-500">{r.notes}</div>}</td>
                <td className="space-x-2 text-xs">
                  {r.status === "PENDING" && (
                    <>
                      <button type="button" className="text-emerald-700" disabled={busyId === r.id} onClick={() => decide(r.id, "APPROVED")}>Approve</button>
                      <button type="button" className="text-rose-600" disabled={busyId === r.id} onClick={() => decide(r.id, "REJECTED")}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={9} className="text-center text-gray-400 py-8">No leave requests in this view</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
