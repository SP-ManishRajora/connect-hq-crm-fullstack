"use client";
import { useState } from "react";

type Device = {
  id: string; deviceId: string; label: string | null;
  lastSeenAt: string; revokedAt: string | null; createdAt: string;
  visitCount: number;
  user: { id: string; name: string; email: string; role: string; center: { name: string } | null };
};
type Retention = {
  photoRetentionDays: number; dryRun: boolean;
  maxDeletesPerRun: number; blockRevokedDevices: boolean;
};

export default function SecurityClient({
  devices: initial, retention,
}: {
  devices: Device[]; retention: Retention;
}) {
  const [devices, setDevices] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [showRevoked, setShowRevoked] = useState(true);

  async function reload() {
    const r = await fetch("/api/housekeeping/devices");
    if (r.ok) setDevices(await r.json());
  }

  async function toggle(d: Device) {
    const restoring = Boolean(d.revokedAt);
    if (!restoring) {
      const ok = confirm(
        `Revoke this device for ${d.user.name}?\n\n` +
        `It will immediately stop being able to scan QR codes or upload photographs. ` +
        `Past inspections are unaffected.`,
      );
      if (!ok) return;
    }
    setBusy(d.id);
    setMsg(null);
    try {
      const r = await fetch(`/api/housekeeping/devices/${d.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: restoring }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({
        kind: "ok",
        text: restoring
          ? `Device restored — ${d.user.name} can inspect from it again.`
          : `Device revoked — it can no longer scan or upload.`,
      });
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  // Dry run first — deleting evidence should never be a surprise.
  async function dryRun() {
    setBusy("retention");
    setMsg(null);
    try {
      const r = await fetch("/api/housekeeping/cron/retention?dry=1", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPreview(j);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function runPurge() {
    const total = preview?.wouldPurge?.total ?? 0;
    if (!confirm(
      `Permanently delete ${total} photograph file(s) older than ${retention.photoRetentionDays} days?\n\n` +
      `Records, scores, findings and the audit trail are all kept — only the image files are removed. ` +
      `This cannot be undone.`,
    )) return;

    setBusy("retention");
    try {
      const r = await fetch("/api/housekeeping/cron/retention", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({
        kind: "ok",
        text: `Purged ${j.purged} photograph(s), freeing ${j.mbFreed} MB.` +
          (j.moreRemaining ? " More remain — run again." : ""),
      });
      setPreview(null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const shown = showRevoked ? devices : devices.filter((d) => !d.revokedAt);
  const revokedCount = devices.filter((d) => d.revokedAt).length;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">🔐 Security &amp; Retention</h1>
      <p className="text-sm text-gray-500 mb-5">
        Inspection devices and the photograph retention policy.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      {/* ---------- retention ---------- */}
      <section className="rounded-xl border bg-white p-4 mb-5">
        <h2 className="font-medium text-sm mb-2">Photograph retention</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Keep for" value={`${retention.photoRetentionDays} days`} />
          <Stat label="Per-run cap" value={String(retention.maxDeletesPerRun)} />
          <Stat label="Mode" value={retention.dryRun ? "dry run" : "live"} />
          <Stat label="Revoked devices" value={retention.blockRevokedDevices ? "blocked" : "flagged"} />
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Only the image files are deleted. Inspection records, scores, AI findings and the audit
          trail are kept permanently — a purged photograph shows as “removed under the retention
          policy” rather than disappearing silently.
        </p>

        {preview && (
          <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium mb-1">
              {preview.wouldPurge.total} file(s) are older than {preview.retentionDays} days
            </div>
            <div className="text-xs">
              inspections {preview.wouldPurge.inspectionPhotos} · generator{" "}
              {preview.wouldPurge.generatorPhotos} · requests {preview.wouldPurge.requestPhotos}
              <br />cut-off {new Date(preview.cutoff).toLocaleDateString()}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={dryRun} disabled={busy === "retention"}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40">
            {busy === "retention" ? "Checking…" : "Preview what would be deleted"}
          </button>
          {preview && preview.wouldPurge.total > 0 && (
            <button onClick={runPurge} disabled={busy === "retention"}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-40">
              Purge {preview.wouldPurge.total} file(s)
            </button>
          )}
        </div>
      </section>

      {/* ---------- devices ---------- */}
      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-medium text-sm">Inspection devices</h2>
            <p className="text-xs text-gray-500">
              {devices.length} registered{revokedCount > 0 && ` · ${revokedCount} revoked`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)} className="rounded" />
            Show revoked
          </label>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Device</th>
              <th className="px-4 py-2 text-right">Scans</th>
              <th className="px-4 py-2">Last seen</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((d) => (
              <tr key={d.id} className={d.revokedAt ? "bg-rose-50/40" : ""}>
                <td className="px-4 py-2">
                  <div className="font-medium">{d.user.name}</div>
                  <div className="text-xs text-gray-500">
                    {d.user.role}{d.user.center && ` · ${d.user.center.name}`}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="font-mono text-[11px] text-gray-600">
                    {d.deviceId.slice(0, 18)}…
                  </div>
                  {d.revokedAt && (
                    <span className="inline-block mt-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                      revoked {new Date(d.revokedAt).toLocaleDateString()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{d.visitCount}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {new Date(d.lastSeenAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => toggle(d)} disabled={busy === d.id}
                    className={`rounded border px-2.5 py-1 text-xs disabled:opacity-40 ${
                      d.revokedAt ? "hover:bg-gray-50" : "border-rose-200 text-rose-700 hover:bg-rose-50"}`}>
                    {busy === d.id ? "…" : d.revokedAt ? "Restore" : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  No devices registered yet — they appear after the first QR scan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-gray-400 mt-4">
        A device identifier is stored in the browser and can be cleared by the user, so this
        stops casual reuse of a lost phone rather than a determined actor. It is one signal
        among several — GPS, server time, dwell time and photo hashing all apply independently.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
