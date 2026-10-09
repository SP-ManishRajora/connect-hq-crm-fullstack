"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { allowedNextStatuses } from "@/lib/leadStatus";
import PartnerPicker from "@/components/PartnerPicker";
import { isValidIndianPhone, isValidEmail } from "@/lib/validators";
import { fmtDate } from "@/lib/utils";
import { isOldDataSource } from "@/lib/oldLeads";

// WEBSITE_CALL leads are normally created from the Website Calls report, which
// attaches the caller's campaign; listed here so a manual entry can use it too.
const SOURCE = ["WEB_FORM", "WEBSITE_CALL", "CALL", "WHATSAPP", "WALK_IN", "REFERRAL"];

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
  // "main" = live pipeline; "old" = imported spreadsheet rows nobody has followed up yet.
  // A status change, edit or comment moves an imported lead to the main tab
  // (its source becomes "Old Leads · <date>").
  const [tab, setTab] = useState<"main" | "old">("main");

  // Pick up the server's list after router.refresh() (new lead, import).
  useEffect(() => setLeads(initialLeads), [initialLeads]);
  const [form, setForm] = useState<any>({ ...emptyForm });

  // Bulk import of the old lead spreadsheet: preview (dry run) first, then commit.
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);

  async function runImport(dryRun: boolean) {
    if (!importFile) { alert("Choose a file"); return; }
    setImportBusy(true);
    const fd = new FormData();
    fd.append("file", importFile);
    if (dryRun) fd.append("dryRun", "1");
    const r = await fetch("/api/leads/bulk-import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setImportBusy(false);
    if (!r.ok) { alert(j.error || "Import failed"); return; }
    if (dryRun) { setImportPreview(j); setImportResult(null); }
    else { setImportResult(j); setImportPreview(null); setTab("old"); router.refresh(); }
  }

  function resetImport() {
    setShowImport(false); setImportFile(null); setImportPreview(null); setImportResult(null);
  }

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
            ? { ...l, status: updated.status, source: updated.source, _count: { ...l._count, comments: (l._count?.comments || 0) + 1 } }
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

  const oldCount = leads.filter((l) => isOldDataSource(l.source)).length;
  const filtered = leads.filter((l) => {
    if (isOldDataSource(l.source) !== (tab === "old")) return false;
    if (stage && l.status !== stage) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return [l.name, l.phone, l.email, l.company, l.source].some((x) => (x || "").toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">CRM / Leads</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => (showImport ? resetImport() : setShowImport(true))}>Import old data</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Lead</button>
        </div>
      </div>

      {showImport && (
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold">Import old leads from Excel</h2>
            <p className="muted text-sm">
              Upload the lead workbook (.xlsx). Every sheet with <b>Client&apos;s Name</b> and <b>Mobile No.</b> / <b>Date</b> columns is read;
              other sheets are skipped. Each lead is saved with source <b>Old Data · &lt;enquiry date&gt;</b> and listed in the <b>Old Lead</b> tab; remarks become comments,
              and anything that doesn&apos;t fit a field is kept in notes. Uploading the same file again skips rows already imported.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              aria-label="Lead workbook"
              onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); setImportResult(null); }}
            />
            <button className="btn-ghost disabled:opacity-50" disabled={!importFile || importBusy} onClick={() => runImport(true)}>
              {importBusy && !importPreview ? "Reading…" : "Preview"}
            </button>
            {importPreview && importPreview.willCreate > 0 && (
              <button className="btn-primary disabled:opacity-50" disabled={importBusy} onClick={() => runImport(false)}>
                {importBusy ? "Importing…" : `Import ${importPreview.willCreate} leads`}
              </button>
            )}
            <button className="btn-ghost" onClick={resetImport}>Close</button>
          </div>

          {(importPreview || importResult) && (() => {
            const s = importResult || importPreview;
            return (
              <div className="text-sm space-y-2">
                {importResult ? (
                  <p className="font-medium text-teal-700">
                    Imported {importResult.created} leads.{importResult.errorCount ? ` ${importResult.errorCount} rows failed.` : ""}
                  </p>
                ) : (
                  <p className="font-medium">Will create {s.willCreate} leads.</p>
                )}
                <ul className="list-disc ml-5 text-gray-600">
                  <li>{s.totalRows} lead rows read; {s.duplicatesInFile} duplicates inside the file; {s.alreadyImported} already imported earlier.</li>
                  <li>
                    By status:{" "}
                    {Object.entries(s.byStatus || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}
                  </li>
                  <li>{s.noPhone} without a valid mobile number; {s.noCenter} without a matching center.</li>
                  {s.dateProblemCount > 0 && (
                    <li>
                      {s.dateProblemCount} with an unreadable or future date — imported with the date as written in the source, dated today:
                      <span className="text-gray-500">
                        {" "}{s.dateProblems.slice(0, 8).map((d: any) => `${d.name} (${d.sheet} row ${d.row}: ${d.date})`).join("; ")}
                        {s.dateProblemCount > 8 ? "…" : ""}
                      </span>
                    </li>
                  )}
                  {s.skippedSheets?.length > 0 && (
                    <li>Skipped sheets: {s.skippedSheets.map((x: any) => x.sheet).join(", ")}</li>
                  )}
                </ul>
                {importResult?.errors?.length > 0 && (
                  <ul className="text-rose-600 text-xs list-disc ml-5">
                    {importResult.errors.slice(0, 10).map((e: any, i: number) => (
                      <li key={i}>{e.sheet} row {e.row} ({e.name}): {e.error}</li>
                    ))}
                  </ul>
                )}
                {importPreview?.sample?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table text-xs">
                      <thead><tr><th>Sheet / row</th><th>Name</th><th>Phone</th><th>Source</th><th>Status</th><th>Seats</th><th>Center</th></tr></thead>
                      <tbody>
                        {importPreview.sample.map((r: any, i: number) => (
                          <tr key={i}>
                            <td>{r.sheet} / {r.row}</td><td>{r.name}</td><td>{r.phone || "—"}</td><td>{r.source}</td>
                            <td>{r.status}</td><td>{r.seats ?? "—"}{r.workspaceType ? ` (${r.workspaceType})` : ""}</td><td>{r.center || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="muted">
        Public web form leads land here automatically: <code className="bg-gray-100 px-1 rounded">/lead-form</code>. WhatsApp/call comments can be added per-lead.
      </div>

      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {([
          ["main", "Lead", leads.length - oldCount],
          ["old", "Old Lead", oldCount],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px rounded-t-lg border px-5 py-2 text-sm font-semibold transition ${
              tab === key
                ? "border-gray-200 border-b-white bg-white text-brand-600"
                : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                tab === key ? "bg-brand-600 text-white" : "bg-white text-gray-500"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === "old" && (
        <div className="muted text-sm">
          Leads imported from the old spreadsheets. Once you change a lead&apos;s status, edit it or add a follow-up comment,
          it moves to the Lead tab with source <b>Old Leads</b>.
        </div>
      )}

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
          <input placeholder="Search name/phone/email/company/source" className="input max-w-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
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
