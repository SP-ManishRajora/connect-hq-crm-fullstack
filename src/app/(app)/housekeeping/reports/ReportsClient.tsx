"use client";
import { useState } from "react";

type Table = {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  note?: string;
};
type Center = { id: string; name: string };

export default function ReportsClient({
  reports, centers, initialType,
}: {
  reports: { type: string; label: string }[];
  centers: Center[];
  initialType: string;
}) {
  const [type, setType] = useState(initialType);
  const [centerId, setCenterId] = useState("");
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [severity, setSeverity] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function qs(format?: string) {
    const p = new URLSearchParams({ type, from, to });
    if (centerId) p.set("centerId", centerId);
    if (severity) p.set("severity", severity);
    if (format) p.set("format", format);
    return p.toString();
  }

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/housekeeping/reports?${qs()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Report failed");
      setTable(j);
    } catch (e: any) {
      setErr(e.message);
      setTable(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">📋 Housekeeping Reports</h1>
      <p className="text-sm text-gray-500 mb-5">
        {reports.length} reports · export to CSV, Excel or PDF.
      </p>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Report</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setTable(null); }}
              className="w-full rounded-md border px-3 py-2 text-sm">
              {reports.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Centre</label>
            <select value={centerId} onChange={(e) => setCenterId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm">
              <option value="">All centres</option>
              {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm">
              <option value="">Any</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={busy}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy ? "Running…" : "Run report"}
          </button>
        </div>

        {table && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
            <span className="text-xs text-gray-500 self-center mr-1">Export:</span>
            <a href={`/api/housekeeping/reports?${qs("csv")}`}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50">CSV</a>
            <a href={`/api/housekeeping/reports?${qs("xlsx")}`}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50">Excel</a>
            <a href={`/api/housekeeping/reports?${qs("pdf")}`} target="_blank" rel="noopener"
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50">PDF / print</a>
          </div>
        )}
      </div>

      {err && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

      {table && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="font-medium">{table.title}</div>
            <div className="text-xs text-gray-500">{table.rows.length} rows</div>
          </div>
          {table.note && (
            <div className="px-4 py-2.5 bg-amber-50 text-xs text-amber-900 border-b">{table.note}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>{table.columns.map((c) => <th key={c.key} className="px-3 py-2 whitespace-nowrap">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {table.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {table.columns.map((c) => (
                      <td key={c.key} className="px-3 py-2 whitespace-nowrap">{r[c.key] ?? ""}</td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="px-3 py-8 text-center text-gray-500">
                      No data for these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!table && !err && (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          Choose a report and press <strong>Run report</strong>.
        </div>
      )}
    </div>
  );
}
