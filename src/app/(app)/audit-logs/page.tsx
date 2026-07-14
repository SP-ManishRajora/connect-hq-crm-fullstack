"use client";
import { useState, useEffect, useCallback } from "react";

const ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: "Client Created",
  PROPOSAL_CREATED: "Proposal Created",
  PROPOSAL_APPROVED: "Proposal Approved",
  PROPOSAL_REJECTED: "Proposal Rejected",
  PROPOSAL_ACCEPTED: "Proposal Accepted",
  INVOICE_SENT: "Invoice Sent",
  LEAD_UPDATED: "Lead Updated",
  LEAD_STATUS_UPDATED: "Lead Status Updated",
  LEAD_DELETED: "Lead Deleted",
  REFERRAL_UPDATED: "Referral Updated",
  REFERRAL_DELETED: "Referral Deleted",
};

const ACTION_COLORS: Record<string, string> = {
  CLIENT_CREATED: "bg-green-100 text-green-800",
  PROPOSAL_CREATED: "bg-blue-100 text-blue-800",
  PROPOSAL_APPROVED: "bg-emerald-100 text-emerald-800",
  PROPOSAL_REJECTED: "bg-red-100 text-red-800",
  PROPOSAL_ACCEPTED: "bg-purple-100 text-purple-800",
  INVOICE_SENT: "bg-amber-100 text-amber-800",
  LEAD_UPDATED: "bg-blue-100 text-blue-800",
  LEAD_STATUS_UPDATED: "bg-indigo-100 text-indigo-800",
  LEAD_DELETED: "bg-red-100 text-red-800",
  REFERRAL_UPDATED: "bg-blue-100 text-blue-800",
  REFERRAL_DELETED: "bg-red-100 text-red-800",
};

// Render a log's `meta` JSON into a readable string, handling our nested
// `changed: {field: {from, to}}` diffs and `snapshot: {...}` delete records.
function formatMeta(metaStr: string | null): string {
  if (!metaStr) return "—";
  let m: any;
  try { m = JSON.parse(metaStr); } catch { return metaStr; }

  if (m.changed && typeof m.changed === "object") {
    const parts = Object.entries(m.changed).map(([field, diff]: [string, any]) =>
      diff && typeof diff === "object" && "from" in diff
        ? `${field}: ${fmtVal(diff.from)} → ${fmtVal(diff.to)}`
        : `${field}: ${fmtVal(diff)}`,
    );
    return parts.length ? parts.join(" · ") : "(no fields changed)";
  }
  if (m.snapshot && typeof m.snapshot === "object") {
    return "Deleted: " + Object.entries(m.snapshot)
      .filter(([k]) => !["id", "createdAt", "updatedAt"].includes(k))
      .map(([k, v]) => `${k}: ${fmtVal(v)}`)
      .join(" · ");
  }
  return Object.entries(m).map(([k, v]) => `${k}: ${fmtVal(v)}`).join(" · ");
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterType, setFilterType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterAction) params.set("action", filterAction);
    if (filterType) params.set("targetType", filterType);
    const res = await fetch(`/api/audit-logs?${params}`);
    if (res.ok) setLogs(await res.json());
    setLoading(false);
  }, [filterAction, filterType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <button type="button" onClick={load} className="text-sm text-gray-500 hover:text-gray-800">Refresh</button>
      </div>

      <div className="flex gap-3 mb-6">
        <select className="input text-sm" title="Filter by action" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
          <option value="">All Actions</option>
          {Object.keys(ACTION_LABELS).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <select className="input text-sm" title="Filter by target type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="Client">Client</option>
          <option value="Proposal">Proposal</option>
          <option value="ClientInvoice">Invoice</option>
          <option value="Lead">Lead</option>
          <option value="Referral">Referral</option>
        </select>
        {(filterAction || filterType) && (
          <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={() => { setFilterAction(""); setFilterType(""); }}>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">When</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Target</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No logs found</td></tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{log.user?.name || "system"}</div>
                    {log.user?.email && <div className="text-xs text-gray-400">{log.user.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.targetType && <span>{log.targetType}</span>}
                    {log.targetId && <span className="ml-1 text-xs text-gray-400 font-mono">{log.targetId.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-md" title={formatMeta(log.meta)}>
                    {formatMeta(log.meta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
