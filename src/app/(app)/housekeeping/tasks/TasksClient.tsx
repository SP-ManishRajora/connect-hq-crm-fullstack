"use client";
import { useState } from "react";
import { SEVERITY_META, STATUS_META, type Severity, type IssueStatus } from "@/lib/housekeeping/issues";
import { analyseImage } from "@/lib/housekeeping/client-capture";

type Task = {
  id: string; title: string; description: string | null;
  category: string; severity: Severity; status: IssueStatus;
  dueAt: string | null; beforePhotoUrl: string | null; afterPhotoUrl: string | null;
  center: { name: string }; location: { name: string } | null;
  actions: { id: string; afterPhotoId: string | null }[];
};

export default function TasksClient({ initial }: { initial: Task[] }) {
  const [rows, setRows] = useState<Task[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [uploads, setUploads] = useState<Record<string, { id: string; preview: string; dup: any } | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function reload() {
    const r = await fetch("/api/housekeeping/issues?mine=1&open=1");
    if (r.ok) setRows(await r.json());
  }

  async function post(url: string, body: unknown, okText: string) {
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
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function uploadAfter(issueId: string, file: File | null) {
    if (!file) return;
    setBusy(issueId);
    try {
      const q = await analyseImage(file);
      const fd = new FormData();
      fd.set("file", file);
      if (q.pHash) fd.set("pHash", q.pHash);
      const r = await fetch(`/api/housekeeping/issues/${issueId}/photo`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setUploads((u) => ({ ...u, [issueId]: { id: j.id, preview: URL.createObjectURL(file), dup: j.duplicate } }));
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function dueLabel(t: Task) {
    if (!t.dueAt) return null;
    const diff = new Date(t.dueAt).getTime() - Date.now();
    const h = Math.round(Math.abs(diff) / 3600_000);
    const s = h < 1 ? `${Math.round(Math.abs(diff) / 60000)}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
    return { text: diff < 0 ? `${s} overdue` : `due in ${s}`, late: diff < 0 };
  }

  return (
    <div className="max-w-2xl pb-20">
      <h1 className="text-2xl font-semibold mb-1">🧽 My Tasks</h1>
      <p className="text-sm text-gray-500 mb-5">
        Issues assigned to you. Start the work, upload an after photograph, then submit for verification.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
          Nothing assigned to you right now. 🎉
        </div>
      )}

      <div className="space-y-3">
        {rows.map((t) => {
          const due = dueLabel(t);
          const up = uploads[t.id];
          // Local preview while the upload is fresh; the stored photo once the
          // list has reloaded. Either counts as "an after photo exists".
          const afterSrc = up?.preview ?? t.afterPhotoUrl;
          const hasAfter = Boolean(up ?? t.afterPhotoUrl);
          return (
            <div key={t.id} className={`rounded-xl border bg-white p-4 ${due?.late ? "border-rose-300" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${SEVERITY_META[t.severity].dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {t.location?.name ?? t.center.name} · {t.category}
                    {due && <span className={due.late ? " text-rose-600 font-medium" : ""}> · {due.text}</span>}
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${STATUS_META[t.status].cls}`}>
                  {STATUS_META[t.status].label}
                </span>
              </div>

              {t.description && <p className="text-sm text-gray-600 mt-2">{t.description}</p>}

              {t.beforePhotoUrl && (
                <figure className="mt-3">
                  <figcaption className="text-[10px] uppercase text-gray-500 mb-1">Reported condition</figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.beforePhotoUrl} alt="Before" className="rounded-lg max-h-48 object-cover" />
                </figure>
              )}

              <div className="mt-3">
                {["ASSIGNED", "REJECTED"].includes(t.status) && (
                  <>
                    {t.status === "REJECTED" && (
                      <div className="mb-2 text-xs text-rose-800 bg-rose-50 rounded p-2">
                        This was sent back for rework.
                      </div>
                    )}
                    <button
                      onClick={() => post(`/api/housekeeping/issues/${t.id}/start`, {}, "Work started.")}
                      disabled={busy !== null}
                      className="w-full rounded-lg bg-brand-600 py-3 text-white text-sm font-medium disabled:opacity-40"
                    >
                      Start work
                    </button>
                  </>
                )}

                {t.status === "IN_PROGRESS" && (
                  <div className="space-y-2">
                    {afterSrc && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={afterSrc} alt="After" className="rounded-lg w-full max-h-48 object-cover" />
                        {up?.dup && (
                          <div className="text-xs text-rose-800 bg-rose-50 rounded p-2">
                            ⚠ This photograph {up.dup.kind === "EXACT" ? "is identical to" : "looks very similar to"} an
                            existing one ({up.dup.locationName}) — flagged for review.
                          </div>
                        )}
                      </>
                    )}
                    <input
                      type="file" accept="image/*" capture="environment" disabled={busy !== null}
                      onChange={(e) => uploadAfter(t.id, e.target.files?.[0] ?? null)}
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-white"
                    />
                    <textarea
                      value={notes[t.id] ?? ""} rows={2} placeholder="Notes (optional)"
                      onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() =>
                        post(
                          `/api/housekeeping/issues/${t.id}/complete`,
                          { afterPhotoId: up?.id ?? t.actions[0]?.afterPhotoId ?? null, notes: notes[t.id] || null },
                          "Submitted for verification.",
                        )
                      }
                      disabled={busy !== null || !hasAfter}
                      className="w-full rounded-lg bg-brand-600 py-3 text-white text-sm font-medium disabled:opacity-40"
                    >
                      {hasAfter ? "Submit for verification" : "Add the after photograph first"}
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt("Why can this not be completed?");
                        if (reason) post(`/api/housekeeping/issues/${t.id}/complete`, { unableReason: reason }, "Reported as unable to complete.");
                      }}
                      disabled={busy !== null}
                      className="w-full rounded-lg border py-2 text-sm text-gray-600 disabled:opacity-40"
                    >
                      Unable to complete
                    </button>
                  </div>
                )}

                {t.status === "AWAITING_VERIFICATION" && (
                  <div className="space-y-2">
                    {afterSrc && (
                      <figure>
                        <figcaption className="text-[10px] uppercase text-gray-500 mb-1">Submitted evidence</figcaption>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={afterSrc} alt="After" className="rounded-lg w-full max-h-48 object-cover" />
                      </figure>
                    )}
                    <div className="text-xs text-violet-800 bg-violet-50 rounded p-2.5">
                      Submitted — waiting for a colleague to verify. You cannot sign off your own work.
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
