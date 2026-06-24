"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const REPORTS = [
  { type: "occupancy", label: "Occupancy Report" },
  { type: "vacancy", label: "Vacancy Report" },
  { type: "utilization", label: "Center Utilization" },
  { type: "client-occupancy", label: "Client Occupancy" },
  { type: "revenue", label: "Revenue per Center" },
];

type Table = { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[] };

export default function ReportsClient({ centers }: { centers: { id: string; name: string }[] }) {
  const [type, setType] = useState("occupancy");
  const [centerId, setCenterId] = useState("");
  const [data, setData] = useState<Table | null>(null);
  const [loading, setLoading] = useState(false);

  const qs = useCallback(
    (format?: string) => {
      const p = new URLSearchParams({ type });
      if (centerId) p.set("centerId", centerId);
      if (format) p.set("format", format);
      return p.toString();
    },
    [type, centerId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/occupancy/reports?${qs()}`);
      setData(r.ok ? await r.json() : null);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Occupancy Reports</h1>
          <p className="muted">Filter, preview, and export.</p>
        </div>
        <Link href="/occupancy" className="btn-ghost text-sm">← Dashboard</Link>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="rt">Report</label>
          <select id="rt" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORTS.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rc">Center</label>
          <select id="rc" className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">All centers</option>
            {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <a className="btn-ghost text-sm" href={`/api/occupancy/reports?${qs("csv")}`} target="_blank" rel="noreferrer">⬇ CSV</a>
          <a className="btn-ghost text-sm" href={`/api/occupancy/reports?${qs("pdf")}`} target="_blank" rel="noreferrer">🖨 PDF</a>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading && <p className="muted">Loading…</p>}
        {!loading && data && (
          <>
            <h2 className="h2 mb-2">{data.title} <span className="muted text-sm">— {data.rows.length} rows</span></h2>
            <table className="table text-sm">
              <thead><tr>{data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>{data.columns.map((c) => <td key={c.key}>{String(row[c.key] ?? "")}</td>)}</tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={data.columns.length} className="text-center text-gray-400 py-6">No data</td></tr>}
              </tbody>
            </table>
          </>
        )}
        {!loading && !data && <p className="muted">Failed to load report.</p>}
      </div>
    </div>
  );
}
