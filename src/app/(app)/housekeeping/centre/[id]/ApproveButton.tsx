"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Management sign-off on an inspected area (centre manager and above).
//
// Rendered only when the viewer may actually act, so nobody is shown a control
// that will refuse them. The server enforces the same rules regardless.

export default function ApproveButton({
  visitId,
  approved,
  approvedBy,
  approvedAt,
  rejected,
  rejectedBy,
  rejectionReason,
  canApprove,
  isOwnWork,
}: {
  visitId: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejected: boolean;
  rejectedBy: string | null;
  rejectionReason: string | null;
  canApprove: boolean;
  isOwnWork: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function send(action: "APPROVE" | "REJECT" | "WITHDRAW", why?: string) {
    if (action === "WITHDRAW" && !confirm("Withdraw approval for this inspection?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/housekeeping/visits/${visitId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: why }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setRejecting(false);
      setReason("");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // --- reason prompt -------------------------------------------------------
  if (rejecting) {
    return (
      <div className="w-56 text-right">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="What needs putting right? The inspector will see this."
          className="w-full rounded-md border px-2 py-1.5 text-xs"
        />
        <div className="flex gap-1.5 justify-end mt-1.5">
          <button
            onClick={() => { setRejecting(false); setReason(""); setErr(null); }}
            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => send("REJECT", reason.trim())}
            disabled={busy || reason.trim().length < 3}
            className="rounded bg-rose-600 px-2.5 py-1 text-xs text-white disabled:opacity-40"
          >
            {busy ? "…" : "Send back"}
          </button>
        </div>
        {err && <div className="text-[10px] text-rose-600 mt-1">{err}</div>}
      </div>
    );
  }

  // --- already approved ----------------------------------------------------
  if (approved) {
    return (
      <div className="text-right">
        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          ✓ Approved
        </span>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {approvedBy}
          {approvedAt && ` · ${new Date(approvedAt).toLocaleDateString()}`}
        </div>
        {canApprove && (
          <button
            onClick={() => send("WITHDRAW")}
            disabled={busy}
            className="mt-1 text-[10px] text-gray-400 hover:text-rose-600 disabled:opacity-40"
          >
            withdraw
          </button>
        )}
      </div>
    );
  }

  // --- rejected: awaiting a fresh inspection -------------------------------
  if (rejected) {
    return (
      <div className="text-right w-48">
        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
          ✕ Sent back
        </span>
        {rejectionReason && (
          <div className="text-[10px] text-gray-500 mt-0.5 text-left bg-rose-50 rounded p-1.5">
            “{rejectionReason}”
          </div>
        )}
        <div className="text-[10px] text-gray-400 mt-0.5">by {rejectedBy}</div>
        {canApprove && (
          <button
            onClick={() => send("APPROVE")}
            disabled={busy}
            className="mt-1 text-[10px] text-gray-400 hover:text-emerald-600 disabled:opacity-40"
          >
            approve anyway
          </button>
        )}
      </div>
    );
  }

  if (!canApprove) {
    return (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
        Awaiting approval
      </span>
    );
  }

  // --- pending review ------------------------------------------------------
  return (
    <div className="text-right">
      <div className="flex gap-1.5 justify-end">
        {/* Four-eyes: you may reject your own work (that is just admitting it
            needs redoing) but not approve it. */}
        {isOwnWork ? (
          <span
            className="rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-500 self-center"
            title="You inspected this area — a colleague must approve it"
          >
            Your inspection
          </span>
        ) : (
          <button
            onClick={() => send("APPROVE")}
            disabled={busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? "…" : "Approve"}
          </button>
        )}
        <button
          onClick={() => setRejecting(true)}
          disabled={busy}
          className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {err && <div className="text-[10px] text-rose-600 mt-1 max-w-[140px]">{err}</div>}
    </div>
  );
}
