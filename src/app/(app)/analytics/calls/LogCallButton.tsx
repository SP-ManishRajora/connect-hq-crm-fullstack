"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
 * "This call came from that tap."
 *
 * Opens a small form for the caller's details and posts it to
 * /api/analytics/phone-taps/:id/lead, which creates the lead (or reuses one
 * with the same number) carrying the tap's campaign and click id.
 */
export default function LogCallButton({
  tapId,
  summary,
  canLog,
}: {
  tapId: string;
  /** One line describing the tap, so the salesperson can confirm the match. */
  summary: string;
  canLog: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ leadId: string; created: boolean } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  if (!canLog) return null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/phone-taps/${encodeURIComponent(tapId)}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not log the call (${res.status}).`);
        if (res.status === 409) router.refresh();
      } else {
        setDone({ leadId: body.leadId, created: body.created });
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log the call.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setDone(null);
    setForm({ name: "", phone: "", email: "", notes: "" });
  }

  return (
    <>
      <button type="button" className="btn-ghost text-xs whitespace-nowrap" onClick={() => setOpen(true)}>
        Log call
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={close}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="h2">Log a call from this tap</h2>
            <p className="muted text-xs mt-1 mb-3">{summary}</p>

            {done ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-700">
                  {done.created
                    ? "Lead created with the tap's campaign attached."
                    : "This caller was already a lead — the call is logged on it, and any missing campaign details were filled in."}
                </p>
                <div className="flex gap-2 justify-end">
                  <button type="button" className="btn-ghost text-sm" onClick={close}>Close</button>
                  <Link href={`/leads/${done.leadId}`} className="btn-primary text-sm">Open lead</Link>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="label">Caller&apos;s mobile *</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    required
                    autoFocus
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    If this number is already a lead, the call is added to that lead instead.
                  </p>
                </div>
                <div>
                  <label className="label">Name</label>
                  <input
                    className="input"
                    placeholder="Required for a new lead"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="What they asked about — seats, centre, move-in date"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                {error && <p className="text-sm text-rose-700">{error}</p>}
                <div className="flex gap-2 justify-end">
                  <button type="button" className="btn-ghost text-sm" onClick={close} disabled={busy}>Cancel</button>
                  <button type="submit" className="btn-primary text-sm disabled:opacity-50" disabled={busy}>
                    {busy ? "Saving…" : "Log call"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
