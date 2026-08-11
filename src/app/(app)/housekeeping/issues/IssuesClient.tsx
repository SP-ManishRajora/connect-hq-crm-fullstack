"use client";
import { useState } from "react";
import { SEVERITY_META, STATUS_META, type Severity, type IssueStatus } from "@/lib/housekeeping/issues";

type Person = { id: string; name: string };
// Assignee candidates carry their role and whether they can currently open the
// module, so the dropdown can list everyone but flag those who would not see
// the task until their access is fixed.
type Candidate = { id: string; name: string; role: string; hasAccess: boolean };
type Issue = {
  id: string; title: string; description: string | null;
  category: string; severity: Severity; status: IssueStatus;
  dueAt: string | null; createdAt: string; closedAt: string | null;
  escalatedAt: string | null; source: string;
  center: { id: string; name: string };
  location: { id: string; name: string } | null;
  assignee: Person | null; raisedBy: Person;
  beforePhotoUrl: string | null; afterPhotoUrl: string | null;
  actions: { id: string; startedAt: string | null; completedAt: string | null; unableReason: string | null; notes: string | null; assignee: Person }[];
  _count: { reinspections: number };
};
type Center = { id: string; name: string };
type Loc = { id: string; name: string };

const CATEGORIES = ["cleanliness", "maintenance", "safety", "consumables", "presentation"];

export default function IssuesClient({
  initial, centers, staff, locations, initialCenterId, meId, meRole,
}: {
  initial: Issue[]; centers: Center[]; staff: Candidate[]; locations: Loc[];
  initialCenterId: string; meId: string; meRole: string;
}) {
  const [rows, setRows] = useState<Issue[]>(initial);
  const [centerId, setCenterId] = useState(initialCenterId);
  const [filter, setFilter] = useState<"open" | "all" | "overdue" | "mine">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [raising, setRaising] = useState(false);
  const [detail, setDetail] = useState<Issue | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", category: "cleanliness",
    severity: "MEDIUM" as Severity, locationId: "", assigneeId: "",
  });

  async function reload(cid = centerId, f = filter) {
    const qs = new URLSearchParams({ centerId: cid });
    if (f === "open") qs.set("open", "1");
    if (f === "overdue") qs.set("overdue", "1");
    if (f === "mine") qs.set("mine", "1");
    const r = await fetch(`/api/housekeeping/issues?${qs}`);
    if (r.ok) setRows(await r.json());
  }

  async function act(url: string, body: unknown, okText: string) {
    setBusy(url);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Action failed");
      setMsg({ kind: "ok", text: okText });
      setDetail(null);
      await reload();
      return j;
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function raise() {
    if (form.title.trim().length < 3) return;
    const j = await act("/api/housekeeping/issues", {
      centerId,
      title: form.title.trim(),
      description: form.description || null,
      category: form.category,
      severity: form.severity,
      locationId: form.locationId || null,
      assigneeId: form.assigneeId || null,
      source: "MANUAL",
    }, "Issue raised.");
    if (j) {
      if (j.autoEscalated) {
        setMsg({ kind: "ok", text: `Issue raised and auto-escalated to CRITICAL — it describes a hazard.` });
      }
      setRaising(false);
      setForm({ title: "", description: "", category: "cleanliness", severity: "MEDIUM", locationId: "", assigneeId: "" });
    }
  }

  function overdue(i: Issue) {
    return i.dueAt && !["CLOSED", "CANCELLED"].includes(i.status) && new Date(i.dueAt) < new Date();
  }

  function dueLabel(i: Issue) {
    if (!i.dueAt || ["CLOSED", "CANCELLED"].includes(i.status)) return null;
    const diff = new Date(i.dueAt).getTime() - Date.now();
    const h = Math.round(Math.abs(diff) / 3600_000);
    const t = h < 1 ? `${Math.round(Math.abs(diff) / 60000)}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
    return diff < 0 ? `${t} overdue` : `due in ${t}`;
  }

  const canManage = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(meRole);

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold">🚨 Issues &amp; Corrective Actions</h1>
        <button onClick={() => setRaising((v) => !v)} className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white whitespace-nowrap">
          + Raise issue
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Issues raised from inspections or manually — assigned, worked, verified and closed.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      {raising && (
        <div className="mb-4 rounded-xl border bg-white p-4 space-y-3">
          <div className="font-medium text-sm">New issue</div>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What is wrong? e.g. Exposed wire near washbasin"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2} placeholder="More detail (optional)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })} className="rounded-md border px-3 py-2 text-sm">
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_META[s].label}</option>)}
            </select>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              <option value="">— area (optional) —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="rounded-md border px-3 py-2 text-sm">
              <option value="">— unassigned —</option>
              <optgroup label="Can open Housekeeping">
                {staff.filter((s) => s.hasAccess).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                ))}
              </optgroup>
              {staff.some((s) => !s.hasAccess) && (
                <optgroup label="No Housekeeping access yet">
                  {staff.filter((s) => !s.hasAccess).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.role} (no access)</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button onClick={raise} disabled={busy !== null || form.title.trim().length < 3} className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40">
              Raise
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Hazards (exposed wire, open panel, diesel leak, blocked exit…) are automatically raised as Critical
            regardless of the severity chosen.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <select
          value={centerId}
          onChange={(e) => { setCenterId(e.target.value); reload(e.target.value); }}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["open", "overdue", "mine", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); reload(centerId, f); }}
              className={`px-3 py-2 ${filter === f ? "bg-brand-600 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              {f === "mine" ? "Assigned to me" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500 ml-auto">{rows.length} issue{rows.length === 1 ? "" : "s"}</div>
      </div>

      <div className="space-y-2">
        {rows.map((i) => (
          <div key={i.id} className={`rounded-xl border bg-white p-4 ${overdue(i) ? "border-rose-300" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${SEVERITY_META[i.severity].dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.title}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_META[i.severity].cls}`}>
                    {SEVERITY_META[i.severity].label}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_META[i.status].cls}`}>
                    {STATUS_META[i.status].label}
                  </span>
                  {i.escalatedAt && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">escalated</span>}
                  {i._count.reinspections > 0 && (
                    <span className="text-[10px] text-gray-500">{i._count.reinspections} check{i._count.reinspections === 1 ? "" : "s"}</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {i.location?.name ?? "centre-wide"} · {i.category} ·{" "}
                  {i.assignee ? `assigned to ${i.assignee.name}` : "unassigned"}
                  {dueLabel(i) && (
                    <span className={overdue(i) ? "text-rose-600 font-medium" : ""}> · {dueLabel(i)}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setDetail(i)} className="text-xs text-brand-600 hover:underline flex-shrink-0">
                Open
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
            No issues match this filter.
          </div>
        )}
      </div>

      {/* ---------- detail drawer ---------- */}
      {detail && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDetail(null)}>
          <div className="flex-1 bg-black/30" />
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">{detail.title}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_META[detail.severity].cls}`}>{SEVERITY_META[detail.severity].label}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_META[detail.status].cls}`}>{STATUS_META[detail.status].label}</span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{detail.category}</span>
            </div>

            {detail.description && <p className="text-sm text-gray-700 mb-3">{detail.description}</p>}

            <dl className="text-xs text-gray-600 space-y-1 mb-4">
              <div>Area: <strong>{detail.location?.name ?? "centre-wide"}</strong></div>
              <div>Raised by: <strong>{detail.raisedBy.name}</strong> ({detail.source.toLowerCase()})</div>
              <div>Assignee: <strong>{detail.assignee?.name ?? "unassigned"}</strong></div>
              {detail.dueAt && <div>Due: <strong>{new Date(detail.dueAt).toLocaleString()}</strong></div>}
            </dl>

            {(detail.beforePhotoUrl || detail.afterPhotoUrl) && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {detail.beforePhotoUrl && (
                  <figure>
                    <figcaption className="text-[10px] uppercase text-gray-500 mb-1">Before</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.beforePhotoUrl} alt="Before" className="rounded-lg w-full object-cover" />
                  </figure>
                )}
                {detail.afterPhotoUrl && (
                  <figure>
                    <figcaption className="text-[10px] uppercase text-gray-500 mb-1">After</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.afterPhotoUrl} alt="After" className="rounded-lg w-full object-cover" />
                  </figure>
                )}
              </div>
            )}

            {detail.actions.length > 0 && (
              <div className="mb-4 rounded-lg bg-gray-50 p-3">
                <div className="text-xs font-medium text-gray-700 mb-1">Work history</div>
                {detail.actions.map((a) => (
                  <div key={a.id} className="text-xs text-gray-600">
                    {a.assignee.name}
                    {a.startedAt && ` · started ${new Date(a.startedAt).toLocaleString()}`}
                    {a.completedAt && ` · submitted ${new Date(a.completedAt).toLocaleString()}`}
                    {a.unableReason && <div className="text-amber-700">Unable: {a.unableReason}</div>}
                    {a.notes && <div className="text-gray-500">{a.notes}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* ---------- actions ---------- */}
            <div className="space-y-2">
              {/* Reassignment. Available right through IN_PROGRESS, because staff
                  go off shift, fall ill or hit something they cannot finish —
                  and the work still has to land on someone. */}
              {canManage && ["OPEN", "ASSIGNED", "REJECTED", "IN_PROGRESS"].includes(detail.status) && (
                <div className="rounded-lg border p-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {detail.assignee ? "Reassign to" : "Assign to"}
                    <span className="ml-1 font-normal text-gray-400">
                      ({staff.length} staff)
                    </span>
                  </label>
                  <select
                    value={detail.assignee?.id ?? ""}
                    onChange={(e) => {
                      const picked = staff.find((s) => s.id === e.target.value);
                      act(
                        `/api/housekeeping/issues/${detail.id}/assign`,
                        { assigneeId: e.target.value || null },
                        !picked
                          ? "Returned to the unassigned queue."
                          : picked.hasAccess
                            ? `Reassigned to ${picked.name}.`
                            // Assigning still works, but they cannot open the
                            // module — say so rather than let the task vanish.
                            : `Assigned to ${picked.name}, but their role (${picked.role}) cannot open Housekeeping — grant it under Users → Roles or they will not see this task.`,
                      );
                    }}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">— unassigned —</option>
                    {/* Everyone who can act, first. */}
                    <optgroup label="Can open Housekeeping">
                      {staff.filter((s) => s.hasAccess).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                      ))}
                    </optgroup>
                    {staff.some((s) => !s.hasAccess) && (
                      <optgroup label="No Housekeeping access yet">
                        {staff.filter((s) => !s.hasAccess).map((s) => (
                          <option key={s.id} value={s.id}>{s.name} — {s.role} (no access)</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {detail.status === "IN_PROGRESS" && detail.assignee && (
                    <p className="mt-1.5 text-[11px] text-amber-700">
                      {detail.assignee.name} has already started. Reassigning hands the job to
                      someone else; the work so far stays on the record.
                    </p>
                  )}
                  {detail.status === "REJECTED" && (
                    <p className="mt-1.5 text-[11px] text-rose-700">
                      This was sent back for rework — reassign it if someone else should redo it.
                    </p>
                  )}
                </div>
              )}

              {["ASSIGNED", "REJECTED"].includes(detail.status) &&
                (detail.assignee?.id === meId || canManage) && (
                  <button
                    onClick={() => act(`/api/housekeeping/issues/${detail.id}/start`, {}, "Work started.")}
                    disabled={busy !== null}
                    className="w-full rounded-lg bg-brand-600 py-2.5 text-white text-sm disabled:opacity-40"
                  >
                    Start work
                  </button>
                )}

              {detail.status === "IN_PROGRESS" && (detail.assignee?.id === meId || canManage) && (
                <CompleteBlock issueId={detail.id} onDone={() => { setDetail(null); reload(); }} setMsg={setMsg} />
              )}

              {detail.status === "AWAITING_VERIFICATION" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => act(`/api/housekeeping/issues/${detail.id}/verify`, { verdict: "FAIL" }, "Sent back for rework.")}
                    disabled={busy !== null}
                    className="flex-1 rounded-lg border border-rose-300 py-2.5 text-rose-700 text-sm disabled:opacity-40"
                  >
                    Reject — needs rework
                  </button>
                  <button
                    onClick={() => act(`/api/housekeeping/issues/${detail.id}/verify`, { verdict: "PASS" }, "Issue verified and closed.")}
                    disabled={busy !== null}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-white text-sm disabled:opacity-40"
                  >
                    Verify &amp; close
                  </button>
                </div>
              )}

              {detail.status === "AWAITING_VERIFICATION" && detail.assignee?.id === meId && !["ADMIN", "OWNER"].includes(meRole) && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                  You submitted this work, so a colleague must verify it.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Upload the after-photo, then submit. Kept separate so the drawer stays readable.
function CompleteBlock({
  issueId, onDone, setMsg,
}: {
  issueId: string;
  onDone: () => void;
  setMsg: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dup, setDup] = useState<{ kind: string; locationName: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const { analyseImage } = await import("@/lib/housekeeping/client-capture");
      const q = await analyseImage(file);
      const fd = new FormData();
      fd.set("file", file);
      if (q.pHash) fd.set("pHash", q.pHash);
      const r = await fetch(`/api/housekeeping/issues/${issueId}/photo`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPhotoId(j.id);
      setPreview(URL.createObjectURL(file));
      setDup(j.duplicate);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch(`/api/housekeeping/issues/${issueId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afterPhotoId: photoId, notes: notes || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ kind: "ok", text: "Work submitted for verification." });
      onDone();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="text-sm font-medium">Submit completed work</div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="After" className="w-full rounded-lg max-h-48 object-cover" />
      )}
      {dup && (
        <div className="text-xs text-rose-800 bg-rose-50 rounded p-2">
          ⚠ This photograph {dup.kind === "EXACT" ? "is identical to" : "looks very similar to"} an existing
          one ({dup.locationName}). It has been flagged for review.
        </div>
      )}
      <input
        type="file" accept="image/*" capture="environment" disabled={busy}
        onChange={(e) => upload(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-white"
      />
      <textarea
        value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        placeholder="Notes (optional)" className="w-full rounded-md border px-3 py-2 text-sm"
      />
      <button
        onClick={submit} disabled={busy || !photoId}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-white text-sm disabled:opacity-40"
      >
        {busy ? "Working…" : photoId ? "Submit for verification" : "Add the after photograph first"}
      </button>
    </div>
  );
}
