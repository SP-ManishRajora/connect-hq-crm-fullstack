"use client";
import { useState } from "react";

// Settings UI (item 2.4) — every tunable that previously required API or
// database access.
//
// Deliberately generic: each field is described by a small spec below, so a new
// setting appears here by adding one line rather than writing a form.

type Settings = Record<string, any>;

type Field =
  | { key: string; label: string; type: "number"; hint?: string; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: "bool"; hint?: string }
  | { key: string; label: string; type: "select"; options: string[]; hint?: string }
  | { key: string; label: string; type: "text"; hint?: string; long?: boolean };

type Group = { key: string; title: string; blurb: string; fields: Field[] };

const GROUPS: Group[] = [
  {
    key: "inspection", title: "Inspection & presence", blurb: "How strictly a scan is verified.",
    fields: [
      { key: "rejectOutsideGeofence", label: "Block scans outside the geofence", type: "bool",
        hint: "Off = recorded and flagged. Turn on only once every area has a GPS point, or staff get locked out." },
      { key: "maxGpsAccuracyM", label: "Max GPS accuracy (m)", type: "number", min: 10, max: 1000 },
      { key: "maxTravelSpeedKmh", label: "Implausible travel speed (km/h)", type: "number", min: 10, max: 300 },
      { key: "minSecondsBetweenScans", label: "Minimum gap between scans (s)", type: "number", min: 0, max: 600 },
      { key: "maxPhotoClockSkewSeconds", label: "Photo clock skew tolerance (s)", type: "number", min: 60, max: 86400 },
      { key: "allowGalleryForManagers", label: "Allow gallery upload for managers", type: "bool",
        hint: "Always flagged when used." },
    ],
  },
  {
    key: "issues", title: "Issues & corrective actions", blurb: "Due times per severity.",
    fields: [
      { key: "slaHours.CRITICAL", label: "CRITICAL due within (h)", type: "number", min: 0.5, max: 72, step: 0.5 },
      { key: "slaHours.HIGH", label: "HIGH due within (h)", type: "number", min: 1, max: 168 },
      { key: "slaHours.MEDIUM", label: "MEDIUM due within (h)", type: "number", min: 1, max: 336 },
      { key: "slaHours.LOW", label: "LOW due within (h)", type: "number", min: 1, max: 720 },
      { key: "requireAfterPhoto", label: "Require an after photograph", type: "bool" },
    ],
  },
  {
    key: "generator", title: "Generator tolerances", blurb: "Below these, a change is treated as noise.",
    fields: [
      { key: "fuelToleranceL", label: "Fuel tolerance (L)", type: "number", min: 0, max: 100, step: 0.5 },
      { key: "hourToleranceH", label: "Hour-meter tolerance (h)", type: "number", min: 0, max: 5, step: 0.05 },
      { key: "ocrMismatchFuelL", label: "OCR vs typed — fuel (L)", type: "number", min: 0, max: 100 },
      { key: "ocrMismatchHourH", label: "OCR vs typed — hours", type: "number", min: 0, max: 50 },
      { key: "backdateToleranceMin", label: "Backdating tolerance (min)", type: "number", min: 0, max: 240 },
      { key: "consumptionOverrunFactor", label: "Consumption overrun factor", type: "number", min: 1, max: 5, step: 0.1,
        hint: "× normal max L/h before it is flagged." },
      { key: "conflictWindowMin", label: "Conflicting-reading window (min)", type: "number", min: 1, max: 120 },
    ],
  },
  {
    key: "requests", title: "Client cleaning requests", blurb: "Assignment and completion rules.",
    fields: [
      { key: "autoAssign", label: "Auto-assign by workload", type: "bool" },
      { key: "requireClientConfirmation", label: "Require client confirmation", type: "bool" },
      { key: "autoCloseAfterHours", label: "Auto-close unconfirmed after (h)", type: "number", min: 0, max: 720 },
      { key: "requireQrOnComplete", label: "Require QR re-scan to complete", type: "bool",
        hint: "Turn on once the client stickers are physically mounted." },
      { key: "repeatWindowHours", label: "Repeat-request window (h)", type: "number", min: 1, max: 720 },
    ],
  },
  {
    key: "efficiency", title: "Staff efficiency weights", blurb: "Renormalised automatically; they need not sum to 1.",
    fields: [
      { key: "weights.sla", label: "Rectification within due time", type: "number", min: 0, max: 1, step: 0.05 },
      { key: "weights.quality", label: "Accepted without rework", type: "number", min: 0, max: 1, step: 0.05 },
      { key: "weights.completion", label: "Assigned work completed", type: "number", min: 0, max: 1, step: 0.05 },
      { key: "weights.evidence", label: "After-photograph supplied", type: "number", min: 0, max: 1, step: 0.05 },
      { key: "weights.severity", label: "High-severity handled on time", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    key: "retention", title: "Photo retention", blurb: "Only image files are deleted; records are kept permanently.",
    fields: [
      { key: "photoRetentionDays", label: "Keep photographs for (days)", type: "number", min: 0, max: 3650,
        hint: "0 disables purging entirely." },
      { key: "dryRun", label: "Dry run (report only, delete nothing)", type: "bool" },
      { key: "maxDeletesPerRun", label: "Max deletions per run", type: "number", min: 1, max: 100000 },
      { key: "blockRevokedDevices", label: "Block revoked devices at scan", type: "bool" },
    ],
  },
  {
    key: "ai", title: "AI analysis", blurb: "Thresholds for turning a finding into a tracked issue.",
    fields: [
      { key: "autoQueue", label: "Analyse photographs automatically", type: "bool" },
      { key: "autoIssueMinSeverity", label: "Auto-create issues at or above", type: "select",
        options: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
      { key: "autoIssueMinConfidence", label: "…and above this confidence", type: "number", min: 0, max: 1, step: 0.05,
        hint: "Lower it and you get noise; raise it and hazards may sit unassigned." },
      { key: "maxAttempts", label: "Retry attempts before failing", type: "number", min: 1, max: 10 },
      { key: "batchSize", label: "Jobs per cron tick", type: "number", min: 1, max: 50 },
      { key: "prompts.photo", label: "Photograph prompt override", type: "text", long: true,
        hint: "Blank uses the built-in prompt." },
    ],
  },
];

const get = (o: Settings, path: string) =>
  path.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), o);

function setIn(o: Settings, path: string, v: unknown): Settings {
  const keys = path.split(".");
  const out = { ...o };
  let cur: any = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] ?? {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = v;
  return out;
}

export default function ConfigClient({
  initial, aiDriver, ocrDriver,
}: {
  initial: Record<string, Settings>; aiDriver: string; ocrDriver: string;
}) {
  const [values, setValues] = useState(initial);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>("inspection");

  function edit(group: string, path: string, v: unknown) {
    setValues((s) => ({ ...s, [group]: setIn(s[group], path, v) }));
    setDirty((d) => ({ ...d, [group]: true }));
  }

  async function save(group: string) {
    setBusy(group);
    setMsg(null);
    try {
      const r = await fetch("/api/housekeeping/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, patch: values[group] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      setValues((s) => ({ ...s, [group]: j }));
      setDirty((d) => ({ ...d, [group]: false }));
      setMsg({ kind: "ok", text: "Saved — the change takes effect immediately." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">⚙️ Housekeeping Settings</h1>
      <p className="text-sm text-gray-500 mb-4">
        Every tunable in the module. Changes apply immediately and are written to the audit log
        with their before and after values.
      </p>

      <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <strong>Drivers</strong> are environment variables, not settings — shown here so you can
        see what is actually running.
        <div className="mt-1 flex gap-4">
          <span>AI: <code className="font-mono">{aiDriver}</code>
            {aiDriver === "stub" && <span className="text-amber-700"> — no analysis is performed</span>}</span>
          <span>OCR: <code className="font-mono">{ocrDriver}</code>
            {ocrDriver === "stub" && <span className="text-amber-700"> — no readings extracted</span>}</span>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-3">
        {GROUPS.map((g) => {
          const isOpen = open === g.key;
          const v = values[g.key] ?? {};
          return (
            <section key={g.key} className="rounded-xl border bg-white overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : g.key)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-sm">
                    {g.title}
                    {dirty[g.key] && <span className="ml-2 text-xs text-amber-600">unsaved</span>}
                  </div>
                  <div className="text-xs text-gray-500">{g.blurb}</div>
                </div>
                <span className="text-gray-400">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="border-t px-4 py-3 space-y-3">
                  {g.fields.map((f) => (
                    <div key={f.key}>
                      {f.type === "bool" ? (
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" checked={Boolean(get(v, f.key))}
                            onChange={(e) => edit(g.key, f.key, e.target.checked)}
                            className="mt-0.5 rounded" />
                          <span>
                            <span className="text-sm">{f.label}</span>
                            {f.hint && <span className="block text-xs text-gray-500">{f.hint}</span>}
                          </span>
                        </label>
                      ) : (
                        <>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                          {f.type === "number" && (
                            <input type="number" value={get(v, f.key) ?? ""}
                              min={f.min} max={f.max} step={f.step ?? 1}
                              onChange={(e) => edit(g.key, f.key, e.target.value === "" ? null : Number(e.target.value))}
                              className="w-40 rounded-md border px-3 py-2 text-sm" />
                          )}
                          {f.type === "select" && (
                            <select value={get(v, f.key) ?? ""}
                              onChange={(e) => edit(g.key, f.key, e.target.value)}
                              className="rounded-md border px-3 py-2 text-sm">
                              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )}
                          {f.type === "text" && (
                            f.long ? (
                              <textarea value={get(v, f.key) ?? ""} rows={5}
                                onChange={(e) => edit(g.key, f.key, e.target.value || undefined)}
                                className="w-full rounded-md border px-3 py-2 text-xs font-mono" />
                            ) : (
                              <input value={get(v, f.key) ?? ""}
                                onChange={(e) => edit(g.key, f.key, e.target.value || undefined)}
                                className="w-full rounded-md border px-3 py-2 text-sm" />
                            )
                          )}
                          {f.hint && <div className="text-xs text-gray-500 mt-0.5">{f.hint}</div>}
                        </>
                      )}
                    </div>
                  ))}

                  <button onClick={() => save(g.key)} disabled={busy === g.key || !dirty[g.key]}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40">
                    {busy === g.key ? "Saving…" : dirty[g.key] ? "Save changes" : "No changes"}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
