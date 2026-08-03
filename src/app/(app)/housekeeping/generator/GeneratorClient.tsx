"use client";
import { useState } from "react";
import { analyseImage } from "@/lib/housekeeping/client-capture";

type Gen = {
  id: string; name: string; code: string;
  tankCapacityL: number | null; normalLphMin: number | null; normalLphMax: number | null;
  photoIntervalMin: number; graceMin: number; maxRunHours: number; active: boolean;
  center: { id: string; name: string };
  running: boolean; runningSince: string | null;
  lastReading: { at: string; fuelReading: number | null; hourMeter: number | null } | null;
  _count: { discrepancies: number };
};
type Disc = {
  id: string; ruleCode: string; severity: string; title: string; detail: string | null;
  expected: string | null; actual: string | null; detectedAt: string; resolvedAt: string | null;
  generator: { id: string; name: string; code: string };
};
type Center = { id: string; name: string };

const SEV: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};

export default function GeneratorClient({
  centers, initial, discrepancies, initialCenterId, canAdmin,
}: {
  centers: Center[]; initial: Gen[]; discrepancies: Disc[];
  initialCenterId: string; canAdmin: boolean;
}) {
  const [centerId, setCenterId] = useState(initialCenterId);
  const [gens, setGens] = useState<Gen[]>(initial);
  const [discs, setDiscs] = useState<Disc[]>(discrepancies);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [panel, setPanel] = useState<{ gen: Gen; mode: "ON" | "OFF" | "READING" | "REFILL" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", tankCapacityL: "", normalLphMax: "" });

  async function reload(cid = centerId) {
    const [g, d] = await Promise.all([
      fetch(`/api/housekeeping/generators?centerId=${cid}`),
      fetch(`/api/housekeeping/generators/discrepancies?centerId=${cid}&open=1`),
    ]);
    if (g.ok) setGens(await g.json());
    if (d.ok) setDiscs(await d.json());
  }

  async function addGenerator() {
    if (!form.name.trim() || !form.code.trim()) return;
    setBusy("add");
    try {
      const r = await fetch("/api/housekeeping/generators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          name: form.name.trim(),
          code: form.code.trim(),
          tankCapacityL: form.tankCapacityL ? Number(form.tankCapacityL) : null,
          normalLphMax: form.normalLphMax ? Number(form.normalLphMax) : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setForm({ name: "", code: "", tankCapacityL: "", normalLphMax: "" });
      setAdding(false);
      setMsg({ kind: "ok", text: `Generator "${j.name}" added.` });
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function resolve(d: Disc) {
    const resolution = prompt(`Resolve: ${d.title}\n\nWhat was found / done?`);
    if (!resolution || resolution.trim().length < 3) return;
    setBusy(d.id);
    try {
      const r = await fetch(`/api/housekeeping/generators/discrepancies/${d.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: resolution.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setMsg({ kind: "ok", text: "Discrepancy resolved." });
      await reload();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function runningFor(g: Gen) {
    if (!g.runningSince) return null;
    const h = (Date.now() - new Date(g.runningSince).getTime()) / 3_600_000;
    return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`;
  }

  // Is the mandatory periodic photo overdue for a running generator?
  function photoDue(g: Gen) {
    if (!g.running) return null;
    const since = g.lastReading?.at ?? g.runningSince;
    if (!since) return null;
    const mins = (Date.now() - new Date(since).getTime()) / 60_000;
    const overdue = mins > g.photoIntervalMin + g.graceMin;
    return { mins: Math.round(mins), overdue, limit: g.photoIntervalMin };
  }

  return (
    <div className="max-w-5xl pb-20">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold">⚡ Generator Monitoring</h1>
        {canAdmin && (
          <button onClick={() => setAdding((v) => !v)} className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white whitespace-nowrap">
            + Generator
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Run log, fuel ledger and automatic discrepancy detection.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${
          msg.kind === "ok" ? "bg-emerald-50 text-emerald-800"
          : msg.kind === "warn" ? "bg-amber-50 text-amber-900" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      {adding && (
        <div className="mb-4 rounded-xl border bg-white p-4 flex flex-wrap gap-3 items-end">
          <div><label className="block text-xs text-gray-600 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="DG Set 1" className="rounded-md border px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Code</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="DG-01" className="rounded-md border px-3 py-2 text-sm w-28" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Tank (L)</label>
            <input value={form.tankCapacityL} onChange={(e) => setForm({ ...form, tankCapacityL: e.target.value })}
              type="number" placeholder="250" className="rounded-md border px-3 py-2 text-sm w-24" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Normal L/h max</label>
            <input value={form.normalLphMax} onChange={(e) => setForm({ ...form, normalLphMax: e.target.value })}
              type="number" placeholder="12" className="rounded-md border px-3 py-2 text-sm w-28" /></div>
          <button onClick={addGenerator} disabled={busy === "add"} className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40">
            Add
          </button>
        </div>
      )}

      <select value={centerId} onChange={(e) => { setCenterId(e.target.value); reload(e.target.value); }}
        className="rounded-md border px-3 py-2 text-sm mb-4">
        {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* ---------- open discrepancies ---------- */}
      {discs.length > 0 && (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <div className="font-medium text-sm mb-2">
            {discs.length} open discrepanc{discs.length === 1 ? "y" : "ies"}
          </div>
          <div className="space-y-2">
            {discs.map((d) => (
              <div key={d.id} className="rounded-lg bg-white border p-3">
                <div className="flex items-start gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEV[d.severity] ?? SEV.MEDIUM}`}>
                    {d.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="text-xs text-gray-500">
                      {d.generator.name} · {new Date(d.detectedAt).toLocaleString()}
                    </div>
                    {d.detail && <p className="text-xs text-gray-600 mt-1">{d.detail}</p>}
                    {(d.expected || d.actual) && (
                      <div className="text-[11px] text-gray-500 mt-1">
                        expected <strong>{d.expected ?? "—"}</strong> · actual <strong>{d.actual ?? "—"}</strong>
                      </div>
                    )}
                  </div>
                  <button onClick={() => resolve(d)} disabled={busy === d.id}
                    className="text-xs text-brand-600 hover:underline flex-shrink-0 disabled:opacity-40">
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- generators ---------- */}
      <div className="space-y-3">
        {gens.map((g) => {
          const due = photoDue(g);
          return (
            <div key={g.id} className={`rounded-xl border bg-white p-4 ${g.running ? "border-emerald-300" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${g.running ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-gray-500">{g.code}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {g.running ? `Running for ${runningFor(g)}` : "Off"}
                    {g.lastReading && ` · last reading ${g.lastReading.fuelReading ?? "—"} L`}
                    {g.tankCapacityL && ` / ${g.tankCapacityL} L tank`}
                  </div>
                  {due?.overdue && (
                    <div className="mt-2 text-xs text-rose-700 bg-rose-50 rounded p-2">
                      ⚠ Photograph overdue — {due.mins} min since the last reading (every {due.limit} min required).
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {!g.running && (
                    <button onClick={() => setPanel({ gen: g, mode: "ON" })}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white">Switch ON</button>
                  )}
                  {g.running && (
                    <>
                      <button onClick={() => setPanel({ gen: g, mode: "READING" })}
                        className={`rounded-md px-3 py-1.5 text-xs text-white ${due?.overdue ? "bg-rose-600" : "bg-brand-600"}`}>
                        Log reading
                      </button>
                      <button onClick={() => setPanel({ gen: g, mode: "OFF" })}
                        className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-white">Switch OFF</button>
                    </>
                  )}
                  <button onClick={() => setPanel({ gen: g, mode: "REFILL" })}
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50">Refill</button>
                </div>
              </div>
            </div>
          );
        })}
        {gens.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
            No generators at this centre yet.{canAdmin && " Add one above."}
          </div>
        )}
      </div>

      {panel && (
        <ActionPanel
          gen={panel.gen}
          mode={panel.mode}
          onClose={() => setPanel(null)}
          onDone={(text, kind) => { setMsg({ kind, text }); setPanel(null); reload(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionPanel({
  gen, mode, onClose, onDone,
}: {
  gen: Gen;
  mode: "ON" | "OFF" | "READING" | "REFILL";
  onClose: () => void;
  onDone: (text: string, kind: "ok" | "warn") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ fuelReading: "", hourMeter: "", reason: "", litres: "", costPerL: "", vendor: "", invoiceRef: "" });
  const [files, setFiles] = useState<Record<string, File | undefined>>({});

  const TITLES = {
    ON: "Switch generator ON",
    OFF: "Switch generator OFF",
    READING: "Log a reading",
    REFILL: "Record a diesel refill",
  };

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      // Hash each photo client-side for reuse detection.
      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        fd.set(key, file);
        const q = await analyseImage(file);
        if (q.pHash) fd.set(key.replace("Photo", "PHash"), q.pHash);
      }
      if (f.fuelReading) fd.set("fuelReading", f.fuelReading);
      if (f.hourMeter) fd.set("hourMeter", f.hourMeter);
      if (f.reason) fd.set("reason", f.reason);
      if (f.litres) fd.set("litres", f.litres);
      if (f.costPerL) fd.set("costPerL", f.costPerL);
      if (f.vendor) fd.set("vendor", f.vendor);
      if (f.invoiceRef) fd.set("invoiceRef", f.invoiceRef);
      // The device's own clock, so backdating is detectable against server time.
      fd.set("atClaimed", new Date().toISOString());

      const url =
        mode === "ON" ? `/api/housekeeping/generators/${gen.id}/on`
        : mode === "OFF" ? `/api/housekeeping/generators/${gen.id}/off`
        : mode === "REFILL" ? `/api/housekeeping/generators/${gen.id}/refills`
        : `/api/housekeeping/generators/${gen.id}/readings`;

      const r = await fetch(url, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");

      const d = (j.discrepancies ?? []) as { title: string }[];
      if (mode === "OFF" && j.summary) {
        onDone(
          `Generator off — ran ${(j.summary.runHours ?? 0).toFixed(1)} h, used ` +
            `${j.summary.fuelUsedL ?? "?"} L (${j.summary.litresPerHour ?? "?"} L/h).` +
            (d.length ? ` ${d.length} discrepancy(ies) raised.` : ""),
          d.length ? "warn" : "ok",
        );
      } else {
        onDone(
          d.length ? `Saved — ${d.length} discrepancy(ies) raised: ${d.map((x) => x.title).join("; ")}` : "Saved.",
          d.length ? "warn" : "ok",
        );
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const needs = {
    ON: ["panelPhoto", "tankPhoto"],
    OFF: ["tankPhoto", "meterPhoto"],
    READING: ["tankPhoto"],
    REFILL: [] as string[],
  }[mode];

  const ready =
    mode === "REFILL"
      ? Boolean(f.litres)
      : needs.every((n) => files[n]) &&
        Boolean(f.fuelReading) &&
        (mode === "READING" || Boolean(f.hourMeter));

  const LABELS: Record<string, string> = {
    panelPhoto: "Control panel photograph",
    tankPhoto: "Fuel tank / gauge photograph",
    meterPhoto: "Hour-meter photograph",
  };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div className="w-full max-w-md bg-white h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold">{TITLES[mode]}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="text-sm text-gray-500 mb-4">{gen.name} · {gen.code}</div>

        {err && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

        <div className="space-y-3">
          {needs.map((n) => (
            <div key={n}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {LABELS[n]} <span className="text-rose-600">*</span>
              </label>
              <input type="file" accept="image/*" capture="environment"
                onChange={(e) => setFiles((s) => ({ ...s, [n]: e.target.files?.[0] }))}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-white" />
            </div>
          ))}

          {mode !== "REFILL" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fuel reading (L) <span className="text-rose-600">*</span>
                </label>
                <input type="number" step="0.1" value={f.fuelReading}
                  onChange={(e) => setF({ ...f, fuelReading: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Hour-meter {mode !== "READING" && <span className="text-rose-600">*</span>}
                </label>
                <input type="number" step="0.01" value={f.hourMeter}
                  onChange={(e) => setF({ ...f, hourMeter: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
            </>
          )}

          {mode === "ON" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason for use</label>
              <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}
                placeholder="Mains power failure" className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          )}

          {mode === "REFILL" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Litres added <span className="text-rose-600">*</span>
                </label>
                <input type="number" step="0.1" value={f.litres}
                  onChange={(e) => setF({ ...f, litres: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost / L</label>
                  <input type="number" step="0.01" value={f.costPerL}
                    onChange={(e) => setF({ ...f, costPerL: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                  <input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice ref</label>
                <input value={f.invoiceRef} onChange={(e) => setF({ ...f, invoiceRef: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Photograph (optional)</label>
                <input type="file" accept="image/*" capture="environment"
                  onChange={(e) => setFiles((s) => ({ ...s, photo: e.target.files?.[0] }))}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-white" />
              </div>
            </>
          )}

          <button onClick={submit} disabled={busy || !ready}
            className="w-full rounded-lg bg-brand-600 py-3 text-white font-medium disabled:opacity-40">
            {busy ? "Saving…" : ready ? TITLES[mode] : "Complete the required fields"}
          </button>

          <p className="text-xs text-gray-500">
            The time is recorded by the server, not your device. Readings are checked against the
            previous entry and any mismatch is raised automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
