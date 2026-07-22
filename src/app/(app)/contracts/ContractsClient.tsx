"use client";
import { useMemo, useState } from "react";
import { fmtDate, fmtINR } from "@/lib/utils";
import RevisionBtn from "./RevisionBtn";

// `YYYY-MM` key for a date, used to match the "Next Revision month" filter.
function monthKey(d: string | Date): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export default function ContractsClient({ contracts, centers = [] }: any) {
  const [clientFilter, setClientFilter] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [revisionMonth, setRevisionMonth] = useState(""); // YYYY-MM

  // Distinct clients for the client dropdown (by id + company name).
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contracts) {
      if (c.client?.id) map.set(c.client.id, c.client.companyName);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [contracts]);

  const filtered = useMemo(() => {
    return contracts.filter((c: any) => {
      if (clientFilter && c.client?.id !== clientFilter) return false;
      if (centerFilter && c.client?.centerId !== centerFilter) return false;
      // Start date range (inclusive).
      if (startFrom && new Date(c.startDate) < new Date(startFrom)) return false;
      if (startTo && new Date(c.startDate) > new Date(startTo + "T23:59:59")) return false;
      // Next revision month.
      if (revisionMonth && monthKey(c.revisionDate) !== revisionMonth) return false;
      return true;
    });
  }, [contracts, clientFilter, centerFilter, startFrom, startTo, revisionMonth]);

  const filtersActive = clientFilter || centerFilter || startFrom || startTo || revisionMonth;
  const clearFilters = () => { setClientFilter(""); setCenterFilter(""); setStartFrom(""); setStartTo(""); setRevisionMonth(""); };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Client</label>
          <select className="input" title="Client filter" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">All clients</option>
            {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Center</label>
          <select className="input" title="Center filter" value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}>
            <option value="">All centers</option>
            {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Start from</label>
          <input className="input" type="date" title="Start date from" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Start to</label>
          <input className="input" type="date" title="Start date to" value={startTo} onChange={(e) => setStartTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Next revision month</label>
          <input className="input" type="month" title="Next revision month" value={revisionMonth} onChange={(e) => setRevisionMonth(e.target.value)} />
        </div>
        <div className="text-sm text-gray-500 pb-2">
          <span className="font-semibold text-gray-700">{filtered.length}</span> of {contracts.length}
          {filtersActive && <button type="button" className="ml-3 text-brand-600 hover:underline" onClick={clearFilters}>Clear</button>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Client</th><th>Center</th><th>Start</th><th>Monthly Rent</th><th>Increment %</th><th>Next Revision</th><th>Reminder</th><th></th></tr></thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id}>
                <td className="font-medium">{c.client.companyName}</td>
                <td>{c.client.center.name}</td>
                <td>{fmtDate(c.startDate)}</td>
                <td>{fmtINR(c.monthlyRent)}</td>
                <td>{c.incrementPct}%</td>
                <td>{fmtDate(c.revisionDate)}</td>
                <td>{c.reminderSent ? "✅" : "—"}</td>
                <td><RevisionBtn id={c.id} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-400 py-8">{contracts.length === 0 ? "No contracts" : "No contracts match the filters"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
