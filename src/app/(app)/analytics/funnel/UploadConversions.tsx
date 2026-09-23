"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * Trigger the offline conversion upload.
 *
 * Deliberately a manual button rather than something that fires automatically
 * when a lead is marked won. Uploading to a live ad account is not reversible —
 * Google keeps a conversion once it has it — so a person confirms the batch.
 * Once the numbers have been trusted for a while, a scheduled job can call the
 * same endpoint.
 */
export default function UploadConversions({
  configured,
  pending,
  uploaded,
}: {
  configured: boolean;
  pending: number;
  uploaded: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (!confirm(`Upload ${pending} conversion${pending === 1 ? "" : "s"} to Google Ads? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/analytics/conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Upload failed (${res.status}).`);
      } else {
        setResult(
          body.failed
            ? `Uploaded ${body.uploaded}. ${body.failed} failed — they stay queued and will retry.`
            : `Uploaded ${body.uploaded} conversion${body.uploaded === 1 ? "" : "s"}.`,
        );
        // Failed rows are still pending, so refresh either way.
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        <div className="font-semibold text-amber-900">Google Ads upload is not configured</div>
        <p className="text-amber-800 mt-1">
          {pending > 0
            ? `${pending} won lead${pending === 1 ? "" : "s"} carry a click id and are waiting to be reported.`
            : "Won leads carrying a click id will be listed here once they exist."}{" "}
          Add the <code>GOOGLE_ADS_*</code> values from{" "}
          <code>docs/conversion-tracking.md</code> to enable this.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div>
        <div className="muted text-xs">Waiting to upload</div>
        <div className="text-xl font-bold">{pending.toLocaleString("en-IN")}</div>
      </div>
      <div>
        <div className="muted text-xs">Already reported</div>
        <div className="text-xl font-bold">{uploaded.toLocaleString("en-IN")}</div>
      </div>
      <button
        type="button"
        className="btn-primary disabled:opacity-50"
        onClick={run}
        disabled={busy || pending === 0}
        title={pending === 0 ? "Nothing waiting to upload" : "Send these conversions to Google Ads"}
      >
        {busy ? "Uploading…" : "Upload to Google Ads"}
      </button>
      {result && <span className="text-sm text-emerald-700">{result}</span>}
      {error && <span className="text-sm text-rose-700">{error}</span>}
    </div>
  );
}
