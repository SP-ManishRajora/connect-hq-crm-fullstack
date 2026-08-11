"use client";
import { useState } from "react";
import { CR_STATUS_META, type CrStatus } from "@/lib/housekeeping/requests";
import { analyseImage } from "@/lib/housekeeping/client-capture";

type Person = { id: string; name: string };
type Candidate = { id: string; name: string; role: string; hasAccess: boolean };
type Req = {
  id: string; ticketNo: string; typeNameSnapshot: string;
  description: string | null; priority: string; status: CrStatus;
  autoUrgentReason: string | null; isComplaint: boolean; complaintReason: string | null;
  slaBreached: boolean; qrVerified: boolean; reopenCount: number;
  createdAt: string; dueAt: string | null; completedAt: string | null;
  clientName: string | null; rating: number | null; clientComment: string | null;
  confirmation: string | null;
  center: { id: string; name: string };
  location: { id: string; name: string } | null;
  assignee: Person | null;
  client: { id: string; companyName: string } | null;
  _count: { photos: number };
};

export default function RequestsClient({
  initial, staff, meId, meRole, centers, initialCenterId,
  focusId = null, scannedCode = null,
}: {
  initial: Req[]; staff: Candidate[]; meId: string; meRole: string;
  centers: { id: string; name: string }[]; initialCenterId: string;
  /** Request to open on arrival, handed over from the area sticker. */
  focusId?: string | null;
  /** Code scanned at the area, prefilled into the completion field. */
  scannedCode?: string | null;
}) {
  const [rows, setRows] = useState<Req[]>(initial);
  const [centerId, setCenterId] = useState(initialCenterId);
  const [filter, setFilter] = useState<"open" | "mine" | "complaints" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Opened straight from the area sticker when a code was scanned there.
  const [detail, setDetail] = useState<Req | null>(
    () => (focusId ? initial.find((r) => r.id === focusId) ?? null : null),
  );

  const canManage = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(meRole);

  async function reload(cid = centerId, f = filter) {
    const p = new URLSearchParams({ centerId: cid });
    if (f === "open") p.set("open", "1");
    if (f === "mine") p.set("mine", "1");
    if (f === "complaints") p.set("complaints", "1");
    const r = await fetch(`/api/housekeeping/requests?${p}`);
    if (r.ok) setRows(await r.json());
  }

  async function act(id: string, action: string, body: Record<string, unknown> = {}) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/housekeeping/requests/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Action failed");
      setMsg({
        kind: "ok",
        text: j.convertedToComplaint
          ? "Updated — this request has been flagged as a complaint."
          : "Updated.",
      });
      setDetail(null);
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(id: string, file: File | null) {
    if (!file) return;
    setBusy(id);
    try {
      const q = await analyseImage(file);
      const fd = new FormData();
      fd.set("file", file);
      if (q.pHash) fd.set("pHash", q.pHash);
      const r = await fetch(`/api/housekeeping/requests/${id}/photo`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({
        kind: j.duplicate ? "err" : "ok",
        text: j.duplicate
          ? `Photo uploaded but flagged — it ${j.duplicate.kind === "EXACT" ? "is identical to" : "closely resembles"} an earlier one.`
          : "Photograph uploaded.",
      });
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function due(r: Req) {
    if (!r.dueAt || ["CLOSED", "CANCELLED"].includes(r.status)) return null;
    const diff = new Date(r.dueAt).getTime() - Date.now();
    const m = Math.round(Math.abs(diff) / 60_000);
    const txt = m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
    return { text: diff < 0 ? `${txt} overdue` : `due in ${txt}`, late: diff < 0 };
  }

  const NEXT: Partial<Record<CrStatus, { action: string; label: string }>> = {
    ASSIGNED: { action: "ACCEPT", label: "Accept" },
    ACCEPTED: { action: "ON_THE_WAY", label: "On the way" },
    ON_THE_WAY: { action: "START", label: "Start work" },
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold mb-1">🧼 Cleaning Requests</h1>
      <p className="text-sm text-gray-500 mb-5">
        Client-raised requests from the area QR codes.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={centerId} onChange={(e) => { setCenterId(e.target.value); reload(e.target.value); }}
          className="rounded-md border px-3 py-2 text-sm">
          {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["open", "mine", "complaints", "all"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); reload(centerId, f); }}
              className={`px-3 py-2 ${filter === f ? "bg-brand-600 text-white" : "bg-white hover:bg-gray-50"}`}>
              {f === "mine" ? "Mine" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">{rows.length} request{rows.length === 1 ? "" : "s"}</span>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const d = due(r);
          const next = NEXT[r.status];
          return (
            <div key={r.id} className={`rounded-xl border bg-white p-4 ${r.slaBreached ? "border-rose-300" : r.priority === "URGENT" ? "border-amber-300" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{r.ticketNo}</span>
                    <span className="font-medium">{r.typeNameSnapshot}</span>
                    {r.priority === "URGENT" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">URGENT</span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CR_STATUS_META[r.status].cls}`}>
                      {CR_STATUS_META[r.status].label}
                    </span>
                    {r.isComplaint && (
                      <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">COMPLAINT</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {r.location?.name ?? r.center.name}
                    {r.client && ` · ${r.client.companyName}`}
                    {r.assignee ? ` · ${r.assignee.name}` : " · unassigned"}
                    {d && <span className={d.late ? " text-rose-600 font-medium" : ""}> · {d.text}</span>}
                  </div>
                  {r.description && <p className="mt-1 text-sm text-gray-600">{r.description}</p>}
                  {r.autoUrgentReason && (
                    <div className="mt-1 text-xs text-amber-700">Auto-urgent: {r.autoUrgentReason}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  {next && (r.assignee?.id === meId || canManage) && (
                    <button onClick={() => act(r.id, next.action)} disabled={busy === r.id}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                      {next.label}
                    </button>
                  )}
                  <button onClick={() => setDetail(r)} className="text-xs text-brand-600 hover:underline">
                    Open
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
            No requests match this filter.
          </div>
        )}
      </div>

      {/* ---------- drawer ---------- */}
      {detail && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setDetail(null)}>
          <div className="flex-1 bg-black/30" />
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-semibold">{detail.typeNameSnapshot}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="font-mono text-xs text-gray-500 mb-3">{detail.ticketNo}</div>

            <dl className="text-xs text-gray-600 space-y-1 mb-4">
              <div>Area: <strong>{detail.location?.name ?? "—"}</strong></div>
              <div>Company: <strong>{detail.client?.companyName ?? "guest"}</strong></div>
              {detail.clientName && <div>Requested by: <strong>{detail.clientName}</strong></div>}
              <div>Assignee: <strong>{detail.assignee?.name ?? "unassigned"}</strong></div>
              <div>Raised: <strong>{new Date(detail.createdAt).toLocaleString()}</strong></div>
              {detail.dueAt && <div>Target: <strong>{new Date(detail.dueAt).toLocaleString()}</strong></div>}
              <div>Photos: <strong>{detail._count.photos}</strong>
                {detail.qrVerified ? " · QR verified ✓" : detail.completedAt ? " · no QR scan" : ""}
              </div>
              {detail.confirmation && (
                <div>Client said: <strong>{detail.confirmation}</strong>
                  {detail.rating ? ` (${detail.rating}/5)` : ""}
                </div>
              )}
            </dl>

            {detail.isComplaint && (
              <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                Flagged as a complaint — {detail.complaintReason}
              </div>
            )}
            {detail.clientComment && (
              <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                “{detail.clientComment}”
              </div>
            )}

            <div className="space-y-2">
              {canManage && !["CLOSED", "CANCELLED"].includes(detail.status) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {detail.assignee ? "Reassign to" : "Assign to"}
                    <span className="ml-1 font-normal text-gray-400">({staff.length} staff)</span>
                  </label>
                  <select defaultValue={detail.assignee?.id ?? ""}
                    onChange={(e) => e.target.value && act(detail.id, "ASSIGN", { assigneeId: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm">
                    <option value="">— assign to —</option>
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
                </div>
              )}

              {detail.status === "IN_PROGRESS" && (detail.assignee?.id === meId || canManage) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">Complete this request</div>
                  <input type="file" accept="image/*" capture="environment" disabled={busy === detail.id}
                    onChange={(e) => uploadPhoto(detail.id, e.target.files?.[0] ?? null)}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-white" />
                  <div className="text-xs text-gray-500">
                    {detail._count.photos} photograph{detail._count.photos === 1 ? "" : "s"} uploaded
                  </div>
                  {/* Prefilled when the sticker was already scanned to get here.
                      The printed sticker carries the code beneath the QR, so typing
                      it is a genuine fallback when a camera won't cooperate. */}
                  <input id={`qr-${detail.id}`} defaultValue={scannedCode ?? ""}
                    placeholder="Scan or type the code under the area QR"
                    className="w-full rounded-md border px-3 py-2 text-sm" />
                  {scannedCode && (
                    <div className="text-xs text-emerald-700">
                      Code from the sticker you scanned is filled in.
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const el = document.getElementById(`qr-${detail.id}`) as HTMLInputElement | null;
                      act(detail.id, "COMPLETE", { qrCode: el?.value?.trim() || null });
                    }}
                    disabled={busy === detail.id || detail._count.photos === 0}
                    className="w-full rounded-lg bg-brand-600 py-2.5 text-white text-sm disabled:opacity-40">
                    {detail._count.photos === 0 ? "Upload a photograph first" : "Mark completed"}
                  </button>
                  <button onClick={() => act(detail.id, "UNABLE", { note: prompt("Why can't this be completed?") ?? undefined })}
                    disabled={busy === detail.id}
                    className="w-full rounded-lg border py-2 text-sm text-gray-600 disabled:opacity-40">
                    Unable to complete
                  </button>
                </div>
              )}

              {canManage && !["CLOSED", "CANCELLED"].includes(detail.status) && (
                <button onClick={() => act(detail.id, "CANCEL")} disabled={busy === detail.id}
                  className="w-full rounded-lg border border-rose-200 py-2 text-sm text-rose-700 disabled:opacity-40">
                  Cancel request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
