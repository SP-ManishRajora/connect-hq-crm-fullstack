"use client";
import { useEffect, useRef, useState } from "react";

type Notif = {
  channel: string; status: string; sentAt: string | null;
  recipients: string; error: string | null;
};
type Alert = {
  id: string; title: string; body: string | null; severity: string; alertType: string;
  status: string; createdAt: string; ackAt: string | null;
  center: { id: string; name: string };
  ackBy: { id: string; name: string } | null;
  notifications: Notif[];
};

const SEV: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};
const DELIVERY: Record<string, string> = {
  SENT: "text-emerald-600", FAILED: "text-rose-600",
  SKIPPED: "text-gray-400", PENDING: "text-amber-600",
};

export default function AlertsClient({ initial }: { initial: Alert[] }) {
  const [rows, setRows] = useState<Alert[]>(initial);
  const [filter, setFilter] = useState<"all" | "new">("new");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const latest = useRef<string>(initial[0]?.createdAt ?? new Date().toISOString());

  // In-app live alerts (8.4): poll for anything newer than the newest we hold.
  // Polling rather than SSE — it matches the repo's patterns and survives a
  // serverless deployment where a long-lived connection would not.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/housekeeping/alerts?since=${encodeURIComponent(latest.current)}`);
        if (!r.ok) return;
        const fresh: Alert[] = await r.json();
        if (fresh.length) {
          latest.current = fresh[0].createdAt;
          setRows((prev) => [...fresh, ...prev]);
        }
      } catch {
        // a failed poll is not worth surfacing; the next tick retries
      }
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  async function ack(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/housekeeping/alerts/${id}/ack`, { method: "POST" });
      if (r.ok) {
        const updated = await r.json();
        setRows((p) => p.map((a) => (a.id === id ? { ...a, status: updated.status, ackAt: updated.ackAt } : a)));
      }
    } finally {
      setBusy(null);
    }
  }

  const shown = filter === "new" ? rows.filter((a) => a.status === "NEW") : rows;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">🔔 Alerts</h1>
      <p className="text-sm text-gray-500 mb-4">
        Notifications with their delivery status. Updates automatically every 30 seconds.
      </p>

      <div className="flex rounded-md border overflow-hidden text-sm mb-4 w-fit">
        {(["new", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 ${filter === f ? "bg-brand-600 text-white" : "bg-white hover:bg-gray-50"}`}>
            {f === "new" ? `Unread (${rows.filter((a) => a.status === "NEW").length})` : `All (${rows.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.map((a) => {
          const n = a.notifications[0];
          return (
            <div key={a.id} className={`rounded-xl border bg-white p-4 ${a.status === "NEW" ? "border-l-4 border-l-brand-500" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${SEV[a.severity] ?? SEV.MEDIUM}`}>
                  {a.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.center.name} · {new Date(a.createdAt).toLocaleString()} · {a.alertType.replace(/_/g, " ").toLowerCase()}
                    {n && (
                      <>
                        {" · "}
                        <span className={DELIVERY[n.status] ?? ""}>
                          {n.channel === "IN_APP" ? "in-app" : `email ${n.status.toLowerCase()}`}
                        </span>
                      </>
                    )}
                  </div>
                  {a.ackBy && (
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Acknowledged by {a.ackBy.name}
                    </div>
                  )}
                  {open === a.id && a.body && (
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700 font-mono">
                      {a.body}
                    </pre>
                  )}
                  {open === a.id && n?.error && (
                    <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800">
                      Delivery error: {n.error}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  <button onClick={() => setOpen(open === a.id ? null : a.id)}
                    className="text-xs text-brand-600 hover:underline">
                    {open === a.id ? "Hide" : "Details"}
                  </button>
                  {a.status === "NEW" && (
                    <button onClick={() => ack(a.id)} disabled={busy === a.id}
                      className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
            {filter === "new" ? "No unread alerts. 🎉" : "No alerts yet."}
          </div>
        )}
      </div>
    </div>
  );
}
