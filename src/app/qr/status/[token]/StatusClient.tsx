"use client";
import { useEffect, useState } from "react";

type Step = { status: string; label: string; at: string };
type Data = {
  ticketNo: string; type: string; area: string | null; centre: string;
  status: string; statusLabel: string; priority: string;
  createdAt: string; dueAt: string | null; completedAt: string | null;
  confirmation: string | null; rating: number | null;
  progress: Step[];
};

// The journey we show the client — internal states collapse onto these.
const JOURNEY = [
  { key: "NEW",         label: "Request received" },
  { key: "ASSIGNED",    label: "Housekeeping assigned" },
  { key: "ON_THE_WAY",  label: "Staff on the way" },
  { key: "IN_PROGRESS", label: "Cleaning in progress" },
  { key: "COMPLETED",   label: "Request completed" },
];

const REACHED: Record<string, number> = {
  NEW: 0, ASSIGNED: 1, ACCEPTED: 1, ON_THE_WAY: 2, IN_PROGRESS: 3,
  COMPLETED: 4, AWAITING_CONFIRMATION: 4, CLOSED: 4, REOPENED: 1, CANCELLED: 0,
};

export default function StatusClient({ token, data: initial }: { token: string; data: Data }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  // Refresh while the job is live so the client sees progress without reloading.
  useEffect(() => {
    if (["CLOSED", "CANCELLED"].includes(data.status)) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/housekeeping/requests/status/${token}`);
        if (r.ok) setData(await r.json());
      } catch { /* transient — next tick retries */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [token, data.status]);

  const reached = REACHED[data.status] ?? 0;
  const canConfirm = ["COMPLETED", "AWAITING_CONFIRMATION"].includes(data.status) && !data.confirmation;

  async function confirm(verdict: "SATISFACTORY" | "PARTIAL" | "NOT_COMPLETED") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/housekeeping/requests/status/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: verdict, rating: rating || null, comment: comment || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(
        verdict === "NOT_COMPLETED"
          ? "Thank you — we've reopened this and alerted the supervisor."
          : "Thank you for confirming.",
      );
      const fresh = await fetch(`/api/housekeeping/requests/status/${token}`);
      if (fresh.ok) setData(await fresh.json());
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="max-w-md mx-auto pt-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-mono text-sm font-medium">{data.ticketNo}</div>
              <div className="text-xs text-gray-500">
                {data.area ?? data.centre} · {data.type}
              </div>
            </div>
            {data.priority === "URGENT" && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                URGENT
              </span>
            )}
          </div>

          <div className="space-y-0">
            {JOURNEY.map((s, i) => {
              const hit = i <= reached;
              const current = i === reached;
              return (
                <div key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                      hit ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-400"}`}>
                      {hit ? "✓" : i + 1}
                    </div>
                    {i < JOURNEY.length - 1 && (
                      <div className={`w-0.5 h-7 ${i < reached ? "bg-brand-600" : "bg-gray-200"}`} />
                    )}
                  </div>
                  <div className="pb-2">
                    <div className={`text-sm ${current ? "font-medium" : hit ? "" : "text-gray-400"}`}>
                      {s.label}
                    </div>
                    {hit && data.progress.find((p) => p.status === s.key) && (
                      <div className="text-[10px] text-gray-400">
                        {new Date(data.progress.find((p) => p.status === s.key)!.at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {data.status === "REOPENED" && (
            <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              Reopened — a supervisor has been notified.
            </div>
          )}
          {data.status === "CLOSED" && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Closed. Thank you.
              {data.rating ? ` You rated this ${data.rating}/5.` : ""}
            </div>
          )}
        </div>

        {msg && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>
        )}

        {canConfirm && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold mb-1">Was this done properly?</h2>
            <p className="text-sm text-gray-500 mb-4">Your feedback helps us improve.</p>

            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)}
                  className={`text-3xl transition ${n <= rating ? "opacity-100" : "opacity-25"}`}>
                  ⭐
                </button>
              ))}
            </div>

            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              rows={2} maxLength={1000} placeholder="Any comment? (optional)"
              className="w-full rounded-lg border px-3 py-2.5 text-sm mb-3" />

            <div className="space-y-2">
              <button onClick={() => confirm("SATISFACTORY")} disabled={busy}
                className="w-full rounded-xl bg-emerald-600 py-3 text-white font-medium disabled:opacity-40">
                Completed satisfactorily
              </button>
              <button onClick={() => confirm("PARTIAL")} disabled={busy}
                className="w-full rounded-xl border py-3 text-sm disabled:opacity-40">
                Partially completed
              </button>
              <button onClick={() => confirm("NOT_COMPLETED")} disabled={busy}
                className="w-full rounded-xl border border-rose-300 py-3 text-sm text-rose-700 disabled:opacity-40">
                Not completed
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">{data.centre}</p>
      </div>
    </div>
  );
}
