"use client";
import { useState } from "react";
import Link from "next/link";
import { getPosition } from "@/lib/housekeeping/client-capture";

type Loc = {
  id: string; name: string; category: string; sortOrder: number;
  lat: number | null; lng: number | null; geofenceRadiusM: number;
  requiredPhotoCount: number; minDwellSeconds: number; priority: string;
  active: boolean;
  center: { id: string; name: string };
  qrCodes: { id: string; code: string; version: number }[];
};
type Center = { id: string; name: string; city: string };

const CATEGORIES = [
  "BATHROOM", "COMMON_AREA", "PARKING", "FRONT_AREA", "BACK_AREA",
  "GUARD_ROOM", "ELECTRICITY_ROOM", "GENERATOR_AREA", "FUEL_TANK",
  "PANTRY", "MEETING_ROOM", "RECEPTION", "OTHER",
];

export default function SetupClient({
  centers,
  initial,
  initialCenterId,
}: {
  centers: Center[];
  initial: Loc[];
  initialCenterId: string;
}) {
  const [centerId, setCenterId] = useState(initialCenterId);
  const [rows, setRows] = useState<Loc[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "OTHER" });

  async function reload(cid: string) {
    const r = await fetch(`/api/housekeeping/locations?centerId=${cid}&includeInactive=1`);
    if (r.ok) setRows(await r.json());
  }

  async function switchCenter(cid: string) {
    setCenterId(cid);
    setMsg(null);
    await reload(cid);
  }

  async function addLocation() {
    if (!form.name.trim()) return;
    setBusy("add");
    try {
      const r = await fetch("/api/housekeeping/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, name: form.name.trim(), category: form.category }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      // Mint a QR immediately — a location with no code can't be inspected.
      await fetch(`/api/housekeeping/locations/${j.id}/qr`, { method: "POST" });
      setForm({ name: "", category: "OTHER" });
      setAdding(false);
      setMsg({ kind: "ok", text: `Added "${j.name}" and generated its QR code.` });
      await reload(centerId);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  // Captures the phone's current position as the area's reference point. The
  // admin must physically stand in the area for this to be meaningful.
  async function captureGps(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const fix = await getPosition();
      if (!fix) throw new Error("Could not read your location. Allow location access and retry.");
      const r = await fetch(`/api/housekeeping/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: fix.lat, lng: fix.lng }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setMsg({ kind: "ok", text: `Location point saved (±${Math.round(fix.accuracyM)} m accuracy).` });
      await reload(centerId);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await fetch(`/api/housekeeping/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      await reload(centerId);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function rotateQr(id: string, name: string) {
    if (!confirm(`Generate a new QR code for "${name}"?\n\nThe existing printout will stop working and must be replaced.`)) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/housekeeping/locations/${id}/qr`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error);
      setMsg({
        kind: "ok",
        text: `New QR generated for ${name} — use Print on its row to reprint it.`,
      });
      await reload(centerId);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}" from inspections?\n\nPast inspection history is preserved.`)) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/housekeeping/locations/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error);
      await reload(centerId);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const withGps = rows.filter((r) => r.lat != null).length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold">🔳 Housekeeping Setup</h1>
        <div className="flex gap-2">
          <Link
            href={`/housekeeping/setup/qr-sheet?centerId=${centerId}`}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white whitespace-nowrap"
          >
            Staff QR sheet
          </Link>
          <Link
            href={`/housekeeping/setup/client-qr-sheet?centerId=${centerId}`}
            className="rounded-md border px-4 py-2 text-sm whitespace-nowrap hover:bg-gray-50"
          >
            Client QR sheet
          </Link>
          <Link
            href="/housekeeping/setup/security"
            className="rounded-md border px-4 py-2 text-sm whitespace-nowrap hover:bg-gray-50"
          >
            🔐 Security
          </Link>
          <Link
            href="/housekeeping/setup/config"
            className="rounded-md border px-4 py-2 text-sm whitespace-nowrap hover:bg-gray-50"
          >
            ⚙️ Settings
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Inspection areas and their QR codes. Quantities are data, not fixed — add or remove areas freely.
      </p>

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Centre</label>
          <select
            value={centerId}
            onChange={(e) => switchCenter(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {centers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
          </select>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
          + Add area
        </button>
        <div className="text-xs text-gray-500 ml-auto">
          {rows.length} areas · {withGps} geo-tagged
        </div>
      </div>

      {withGps < rows.length && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {rows.length - withGps} area{rows.length - withGps === 1 ? "" : "s"} have no GPS point yet.
          Scans there are recorded but marked <em>unverified</em>. Stand in each area and tap
          <strong> Set GPS</strong> to enable geofencing.
        </div>
      )}

      {adding && (
        <div className="mb-4 rounded-xl border bg-white p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Area name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bathroom 9"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <button
            onClick={addLocation}
            disabled={busy === "add" || !form.name.trim()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2">Area</th>
              <th className="px-4 py-2">Geofence</th>
              <th className="px-4 py-2">Photos</th>
              <th className="px-4 py-2">Min time</th>
              <th className="px-4 py-2">QR</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((l) => (
              <tr key={l.id} className={l.active ? "" : "opacity-50"}>
                <td className="px-4 py-2">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-gray-500">{l.category.replace(/_/g, " ")}</div>
                </td>
                <td className="px-4 py-2">
                  {l.lat != null ? (
                    <div>
                      <div className="text-xs text-emerald-700">✓ {l.geofenceRadiusM} m</div>
                      <div className="text-[10px] text-gray-400">
                        {l.lat.toFixed(5)}, {l.lng!.toFixed(5)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-700">not set</span>
                  )}
                </td>
                <td className="px-4 py-2">{l.requiredPhotoCount}</td>
                <td className="px-4 py-2">{l.minDwellSeconds}s</td>
                <td className="px-4 py-2">
                  {l.qrCodes[0] ? (
                    <span className="font-mono text-xs">v{l.qrCodes[0].version}</span>
                  ) : (
                    <span className="text-xs text-rose-600">none</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1 justify-end">
                    <button
                      onClick={() => captureGps(l.id)}
                      disabled={busy === l.id}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                      title="Stand in this area, then tap to save its GPS point"
                    >
                      {busy === l.id ? "…" : "Set GPS"}
                    </button>
                    <button
                      onClick={() => rotateQr(l.id, l.name)}
                      disabled={busy === l.id}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                    >
                      New QR
                    </button>
                    {l.qrCodes[0] && (
                      <a
                        href={`/housekeeping/setup/qr-sheet?centerId=${centerId}&locationId=${l.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                        title={`Print just the QR for ${l.name}`}
                      >
                        Print
                      </a>
                    )}
                    <button
                      onClick={() => patch(l.id, { active: !l.active })}
                      disabled={busy === l.id}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40"
                    >
                      {l.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => remove(l.id, l.name)}
                      disabled={busy === l.id}
                      className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No inspection areas for this centre yet. Add one above, or run{" "}
                  <code className="text-xs">npm run db:seed:hk</code> to create the standard set.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
