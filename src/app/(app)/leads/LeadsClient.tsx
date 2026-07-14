"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { allowedNextStatuses } from "@/lib/leadStatus";
import PartnerPicker from "@/components/PartnerPicker";
import { isValidIndianPhone, isValidEmail } from "@/lib/validators";
import { fmtDate } from "@/lib/utils";

const SOURCE = ["WEB_FORM", "CALL", "WHATSAPP", "WALK_IN", "REFERRAL"];

const emptyForm = { source: "CALL", name: "", phone: "", email: "", company: "", seatsNeeded: "", budget: "", centerId: "", notes: "", sourceType: "", partnerContactId: "" };

// Pipeline stages — each maps 1:1 to a lead `status` value (stored as a string).
// This is the single source of truth for the stage bar, the status dropdown, and badge colors.
const STAGES: { label: string; status: string; active: string; idle: string; badge: string }[] = [
  { label: "Lead", status: "Lead", active: "bg-gray-600 text-white", idle: "bg-gray-100 text-gray-700 hover:bg-gray-200", badge: "bg-gray-100 text-gray-700" },
  { label: "Connect", status: "Connect", active: "bg-blue-600 text-white", idle: "bg-blue-100 text-blue-700 hover:bg-blue-200", badge: "bg-blue-100 text-blue-700" },
  { label: "Visit Planned", status: "Visit Planned", active: "bg-indigo-600 text-white", idle: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200", badge: "bg-indigo-100 text-indigo-700" },
  { label: "Visited", status: "Visited", active: "bg-cyan-600 text-white", idle: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200", badge: "bg-cyan-100 text-cyan-700" },
  { label: "Proposal", status: "Proposal", active: "bg-amber-600 text-white", idle: "bg-amber-100 text-amber-700 hover:bg-amber-200", badge: "bg-amber-100 text-amber-700" },
  { label: "Accepted", status: "Accepted", active: "bg-purple-600 text-white", idle: "bg-purple-100 text-purple-700 hover:bg-purple-200", badge: "bg-purple-100 text-purple-700" },
  { label: "Payment", status: "Payment", active: "bg-teal-600 text-white", idle: "bg-teal-100 text-teal-700 hover:bg-teal-200", badge: "bg-teal-100 text-teal-700" },
  { label: "Renewable", status: "Renewable", active: "bg-emerald-600 text-white", idle: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  { label: "Lost", status: "Lost", active: "bg-rose-600 text-white", idle: "bg-rose-100 text-rose-700 hover:bg-rose-200", badge: "bg-rose-100 text-rose-700" },
];

// Status -> badge color (derived from STAGES).
const statusColor: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.status, s.badge]));

// Status -> human label (for table badges).
const statusLabel: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.status, s.label]));

export default function LeadsClient({ initialLeads, centers, partners = [] }: any) {
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>(initialLeads);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stage, setStage] = useState("");
  const [form, setForm] = useState<any>({ ...emptyForm });

  // Inline status-change UI: which lead is open, the chosen next status, and the required comment.
  const [editing, setEditing] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [statusComment, setStatusComment] = useState("");
  const [saving, setSaving] = useState(false);

  function openStatusEdit(lead: any) {
    const opts = allowedNextStatuses(lead.status);
    setEditing(lead.id);
    setNextStatus(opts[0] || "");
    setStatusComment("");
  }

  function cancelStatusEdit() {
    setEditing(null);
    setNextStatus("");
    setStatusComment("");
  }

  async function saveStatus(leadId: string) {
    if (!nextStatus || !statusComment.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, comment: statusComment.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, status: updated.status, _count: { ...l._count, comments: (l._count?.comments || 0) + 1 } }
            : l,
        ),
      );
      cancelStatusEdit();
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  // Lead create-form validation (Indian phone + email; name required; at least one contact).
  const namePresent = form.name.trim() !== "";
  const phoneInvalid = form.phone.trim() !== "" && !isValidIndianPhone(form.phone);
  const emailInvalid = form.email.trim() !== "" && !isValidEmail(form.email);
  const contactPresent = form.phone.trim() !== "" || form.email.trim() !== "";
  const seatsInvalid = form.seatsNeeded !== "" && Number(form.seatsNeeded) <= 0;
  const budgetInvalid = form.budget !== "" && Number(form.budget) < 0;
  const formValid = namePresent && contactPresent && !phoneInvalid && !emailInvalid && !seatsInvalid && !budgetInvalid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ ...emptyForm });
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      console.error("Lead save failed:", res.status, detail);
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  const filtered = leads.filter((l) => {
    if (stage && l.status !== stage) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return [l.name, l.phone, l.email, l.company].some((x) => (x || "").toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">CRM / Leads</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Lead</button>
      </div>

      <div className="muted">
        Public web form leads land here automatically: <code className="bg-gray-100 px-1 rounded">/lead-form</code>. WhatsApp/call comments can be added per-lead.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStage("")}
          className={`badge cursor-pointer transition ${stage === "" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          All
        </button>
        {STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            onClick={() => setStage(stage === s.status ? "" : s.status)}
            className={`badge cursor-pointer transition ${stage === s.status ? s.active : s.idle}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">
          <div><label className="label">Source</label>
            <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCE.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div><label className="label">Phone</label>
            <input
              className={`input ${phoneInvalid ? "border-rose-400" : ""}`}
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            {phoneInvalid && <p className="text-xs text-rose-600 mt-0.5">Enter a valid 10-digit Indian mobile (starts 6-9).</p>}
          </div>
          <div><label className="label">Email</label>
            <input
              className={`input ${emailInvalid ? "border-rose-400" : ""}`}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {emailInvalid && <p className="text-xs text-rose-600 mt-0.5">Enter a valid email address.</p>}
          </div>
          <div><label className="label">Company</label>
            <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div><label className="label">Center</label>
            <select className="input" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
              <option value="">— Any —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Seats needed</label>
            <input
              className={`input ${seatsInvalid ? "border-rose-400" : ""}`}
              type="number" min={1}
              value={form.seatsNeeded}
              onChange={(e) => setForm({ ...form, seatsNeeded: e.target.value })}
            />
            {seatsInvalid && <p className="text-xs text-rose-600 mt-0.5">Seats must be a positive number.</p>}
          </div>
          <div><label className="label">Budget (₹)</label>
            <input
              className={`input ${budgetInvalid ? "border-rose-400" : ""}`}
              type="number" min={0}
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
            {budgetInvalid && <p className="text-xs text-rose-600 mt-0.5">Budget cannot be negative.</p>}
          </div>
          <div className="sm:col-span-2"><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {/* Channel partner: where the lead came from (Broker / Agent / IPC) */}
          <div className="sm:col-span-2 border-t pt-3">
            <PartnerPicker
              partners={partners}
              sourceType={form.sourceType}
              partnerContactId={form.partnerContactId}
              onChange={(next) => setForm({ ...form, ...next })}
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2 justify-end">
            {namePresent && !contactPresent && (
              <span className="text-xs text-rose-600 mr-auto">Add a phone or email.</span>
            )}
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={!formValid}>Save Lead</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          <input placeholder="Search name/phone/email/company" className="input max-w-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STAGES.map((s) => <option key={s.status} value={s.status}>{s.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Source</th><th>Contact</th><th>Center</th><th>Seats</th><th>Status</th><th>Created</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}<div className="text-xs text-gray-500">{l.company}</div></td>
                  <td><span className="badge bg-gray-100 text-gray-700">{l.source}</span></td>
                  <td className="text-xs">{l.phone}<br />{l.email}</td>
                  <td>{l.center?.name || "—"}</td>
                  <td>{l.seatsNeeded || "—"}</td>
                  <td>
                    {editing === l.id ? (
                      <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <select
                          className="input py-1 text-sm"
                          title="Next status"
                          aria-label="Next status"
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value)}
                        >
                          {allowedNextStatuses(l.status).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          className="input py-1 text-sm"
                          placeholder="Comment (required)"
                          value={statusComment}
                          onChange={(e) => setStatusComment(e.target.value)}
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
                            disabled={saving || !statusComment.trim()}
                            onClick={() => saveStatus(l.id)}
                          >
                            {saving ? "…" : "Save"}
                          </button>
                          <button type="button" className="btn-ghost py-1 px-2 text-xs" onClick={cancelStatusEdit}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`badge ${statusColor[l.status] || "bg-gray-100"}`}>{statusLabel[l.status] || l.status}</span>
                        {allowedNextStatuses(l.status).length > 0 && (
                          <button
                            type="button"
                            title="Advance status"
                            onClick={() => openStatusEdit(l)}
                            className="text-gray-400 hover:text-brand-600 transition"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 0110 3z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                  <td><Link href={`/leads/${l.id}`} className="text-brand-600 text-sm">Open →</Link></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-8">No leads</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
