"use client";
import { useCallback, useEffect, useState } from "react";

// AI findings review (brief §6): accept · correct · add a missed issue · mark N/A.
//
// Shown inside the area screen the supervisor is already on, not a separate
// page — reviewing findings is part of inspecting, not a follow-up task.
//
// Analysis is asynchronous, so this polls until the photographs are analysed.
// It never blocks submission: a supervisor can submit the area while analysis is
// still pending, and the findings attach afterwards.

type Finding = {
  id: string;
  photoId: string;
  category: string;
  issue: string;
  severity: string;
  confidence: number;
  recommendedAction: string | null;
  verdict: string;
  correctedIssue: string | null;
  correctedSeverity: string | null;
  driver: string;
  model: string;
  issueId: string | null;
};

const SEV_CLS: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};
const CATEGORIES = ["cleanliness", "consumables", "maintenance", "safety", "presentation"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function AiReview({
  visitId,
  photoIds,
  onCountChange,
}: {
  visitId: string;
  photoIds: string[];
  onCountChange?: (n: number) => void;
}) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [state, setState] = useState<"idle" | "waiting" | "ready" | "off">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ issue: "", severity: "MEDIUM" });
  const [adding, setAdding] = useState(false);
  const [newF, setNewF] = useState({ issue: "", category: "cleanliness", severity: "MEDIUM" });

  const load = useCallback(async () => {
    if (photoIds.length === 0) return;
    try {
      const r = await fetch(`/api/housekeeping/ai/findings?visitId=${visitId}`);
      if (!r.ok) return;
      const j = await r.json();
      setFindings(j.findings ?? []);
      onCountChange?.(j.findings?.length ?? 0);
      setState(j.stub ? "off" : j.pending > 0 ? "waiting" : "ready");
    } catch {
      // transient — the next poll retries
    }
  }, [visitId, photoIds.length, onCountChange]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function review(id: string, verdict: string, extra: Record<string, unknown> = {}) {
    setBusy(id);
    try {
      await fetch(`/api/housekeeping/ai/findings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, ...extra }),
      });
      setEditing(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function addMissed() {
    if (newF.issue.trim().length < 3) return;
    setBusy("add");
    try {
      await fetch(`/api/housekeeping/ai/findings/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitId, photoId: photoIds[0], ...newF, issue: newF.issue.trim() }),
      });
      setNewF({ issue: "", category: "cleanliness", severity: "MEDIUM" });
      setAdding(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (photoIds.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-sm font-medium">AI findings</div>
          <div className="text-xs text-gray-500">
            {state === "off" && "AI analysis is not configured on this server."}
            {state === "waiting" && "Analysing your photographs…"}
            {state === "ready" && findings.length === 0 && "Nothing flagged in these photographs."}
            {state === "ready" && findings.length > 0 &&
              `${findings.length} finding${findings.length === 1 ? "" : "s"} — confirm or correct each.`}
          </div>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="text-xs text-brand-600 hover:underline">
          + Missed something?
        </button>
      </div>

      {state === "waiting" && (
        <div className="mt-2 text-xs text-gray-400">
          You can submit this area now — findings will attach when analysis completes.
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border p-3">
          <input
            value={newF.issue}
            onChange={(e) => setNewF({ ...newF, issue: e.target.value })}
            placeholder="What did the AI miss?"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <select value={newF.category} onChange={(e) => setNewF({ ...newF, category: e.target.value })}
              className="rounded-md border px-2 py-1.5 text-xs">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newF.severity} onChange={(e) => setNewF({ ...newF, severity: e.target.value })}
              className="rounded-md border px-2 py-1.5 text-xs">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={addMissed} disabled={busy === "add" || newF.issue.trim().length < 3}
              className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-white disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {findings.map((f) => {
          const reviewed = f.verdict !== "UNREVIEWED";
          const shown = f.correctedIssue ?? f.issue;
          const sev = f.correctedSeverity ?? f.severity;

          return (
            <div key={f.id}
              className={`rounded-lg border p-3 ${
                f.verdict === "NOT_APPLICABLE" ? "opacity-50" : ""}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEV_CLS[sev] ?? SEV_CLS.MEDIUM}`}>
                  {sev}
                </span>
                <span className="text-[10px] text-gray-400">{f.category}</span>
                {f.driver !== "human" && (
                  <span className="text-[10px] text-gray-400">
                    {Math.round(f.confidence * 100)}% confident
                  </span>
                )}
                {f.verdict === "ADDED" && (
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-white">you added</span>
                )}
                {f.issueId && (
                  <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] text-white">issue raised</span>
                )}
              </div>

              {editing === f.id ? (
                <div className="mt-2 space-y-2">
                  <input value={draft.issue} onChange={(e) => setDraft({ ...draft, issue: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
                      className="rounded-md border px-2 py-1.5 text-xs">
                      {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => review(f.id, "CORRECTED", {
                        correctedIssue: draft.issue, correctedSeverity: draft.severity,
                      })}
                      disabled={busy === f.id}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">
                      Save correction
                    </button>
                    <button onClick={() => setEditing(null)} className="text-xs text-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-1 text-sm">{shown}</div>
                  {f.recommendedAction && (
                    <div className="mt-1 text-xs text-gray-500">{f.recommendedAction}</div>
                  )}

                  {!reviewed && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button onClick={() => review(f.id, "ACCEPTED")} disabled={busy === f.id}
                        className="rounded border px-2.5 py-1 text-xs hover:bg-emerald-50 disabled:opacity-40">
                        ✓ Correct
                      </button>
                      <button
                        onClick={() => { setEditing(f.id); setDraft({ issue: shown, severity: sev }); }}
                        className="rounded border px-2.5 py-1 text-xs hover:bg-gray-50">
                        ✎ Fix it
                      </button>
                      <button onClick={() => review(f.id, "NOT_APPLICABLE")} disabled={busy === f.id}
                        className="rounded border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                        ✕ Not applicable
                      </button>
                    </div>
                  )}

                  {reviewed && f.verdict !== "ADDED" && (
                    <div className="mt-1.5 text-[11px] text-gray-400">
                      {f.verdict === "ACCEPTED" && "Confirmed"}
                      {f.verdict === "CORRECTED" && "Corrected by you"}
                      {f.verdict === "NOT_APPLICABLE" && "Marked not applicable"}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
