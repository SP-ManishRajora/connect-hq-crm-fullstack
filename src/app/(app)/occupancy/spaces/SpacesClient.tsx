"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

type Center = { id: string; name: string };
type ClientLite = { id: string; companyName: string };

const TYPES = ["DEDICATED_SEAT", "HOT_DESK", "CABIN", "MEETING_ROOM", "PRIVATE_OFFICE", "VIRTUAL_OFFICE"];
const STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "BLOCKED"];

const STATUS_CLS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  OCCUPIED: "bg-rose-100 text-rose-700",
  RESERVED: "bg-amber-100 text-amber-700",
  MAINTENANCE: "bg-gray-200 text-gray-700",
  BLOCKED: "bg-gray-800 text-white",
};

const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);

export default function SpacesClient({ centers, clients, canManage }: { centers: Center[]; clients: ClientLite[]; canManage: boolean }) {
  const [centerId, setCenterId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (centerId) p.set("centerId", centerId);
    if (type) p.set("type", type);
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    try {
      const r = await fetch(`/api/occupancy/spaces?${p.toString()}`);
      if (r.ok) {
        const j = await r.json();
        setItems(j.items); setTotal(j.total); setPages(j.pages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [centerId, type, status, q, page, pageSize]);

  useEffect(() => { load(); }, [load]);
  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(1); }, [centerId, type, status, q]);

  const clientOptions = clients.map((c) => `<option value="${c.id}">${c.companyName}</option>`).join("");

  async function doAllocate(space: any) {
    const { value: form } = await Swal.fire({
      title: `Allocate ${space.code}`,
      html:
        `<select id="sw-client" class="swal2-input"><option value="">— Select client —</option>${clientOptions}</select>` +
        `<input id="sw-start" type="date" class="swal2-input" value="${todayISO()}">` +
        `<input id="sw-end" type="date" class="swal2-input" placeholder="End (optional)">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Allocate",
      confirmButtonColor: "#4f46e5",
      preConfirm: () => {
        const clientId = (document.getElementById("sw-client") as HTMLSelectElement).value;
        const start = (document.getElementById("sw-start") as HTMLInputElement).value;
        const end = (document.getElementById("sw-end") as HTMLInputElement).value;
        if (!clientId) { Swal.showValidationMessage("Pick a client"); return false; }
        if (!start) { Swal.showValidationMessage("Start date required"); return false; }
        return { clientId, start, end };
      },
    });
    if (!form) return;
    await run(space.id, "/api/occupancy/allocations", {
      clientId: form.clientId,
      items: [{ spaceId: space.id, seatsTaken: 1 }],
      startDate: form.start,
      endDate: form.end || null,
    });
  }

  async function doReserve(space: any) {
    const { value: form } = await Swal.fire({
      title: `Reserve ${space.code}`,
      html:
        `<input id="sw-exp" type="date" class="swal2-input" value="${todayISO(new Date(Date.now() + 7 * 86400000))}">` +
        `<input id="sw-notes" class="swal2-input" placeholder="Notes (optional)">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Reserve",
      confirmButtonColor: "#4f46e5",
      preConfirm: () => {
        const expiresAt = (document.getElementById("sw-exp") as HTMLInputElement).value;
        const notes = (document.getElementById("sw-notes") as HTMLInputElement).value;
        if (!expiresAt) { Swal.showValidationMessage("Expiry required"); return false; }
        return { expiresAt, notes };
      },
    });
    if (!form) return;
    await run(space.id, "/api/occupancy/reservations", { spaceId: space.id, expiresAt: form.expiresAt, notes: form.notes || null });
  }

  async function doTransfer(space: any) {
    const { value: form } = await Swal.fire({
      title: `Transfer ${space.code}`,
      html: `<select id="sw-toclient" class="swal2-input"><option value="">— Transfer to client —</option>${clientOptions}</select>` +
            `<input id="sw-reason" class="swal2-input" placeholder="Reason (optional)">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Transfer",
      confirmButtonColor: "#4f46e5",
      preConfirm: () => {
        const toClientId = (document.getElementById("sw-toclient") as HTMLSelectElement).value;
        const reason = (document.getElementById("sw-reason") as HTMLInputElement).value;
        if (!toClientId) { Swal.showValidationMessage("Pick a target client"); return false; }
        return { toClientId, reason };
      },
    });
    if (!form) return;
    await run(space.id, "/api/occupancy/transfers", { items: [{ spaceId: space.id, toClientId: form.toClientId, seatsTaken: 1 }], reason: form.reason || null });
  }

  async function doRelease(space: any) {
    const alloc = space.allocations?.[0];
    if (!alloc) return;
    const res = await Swal.fire({
      title: `Release ${space.code}?`,
      text: "This frees the space and ends the active allocation.",
      icon: "warning", showCancelButton: true, confirmButtonText: "Release", confirmButtonColor: "#e11d48",
    });
    if (!res.isConfirmed) return;
    await run(space.id, `/api/occupancy/allocations/${alloc.id}`, { reason: "TERMINATED" }, "DELETE");
  }

  async function setSpaceStatus(space: any, newStatus: string) {
    await run(space.id, `/api/occupancy/spaces/${space.id}`, { status: newStatus }, "PUT");
  }

  // Shared request runner: POST/PUT/DELETE → toast → reload.
  async function run(spaceId: string, url: string, body: any, method: "POST" | "PUT" | "DELETE" = "POST") {
    setBusy(spaceId);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        await Swal.fire({ icon: "success", title: "Done", timer: 1400, showConfirmButton: false });
        await load();
      } else {
        Swal.fire({ icon: "error", title: "Failed", text: j.error || `HTTP ${r.status}`, confirmButtonColor: "#4f46e5" });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Spaces</h1>
          <p className="muted">{total} space(s){centerId ? " in selected center" : " across all centers"}.</p>
        </div>
        <Link href="/occupancy" className="btn-ghost text-sm">← Dashboard</Link>
      </div>

      {/* Filters (server-side) */}
      <div className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="f-center">Center</label>
          <select id="f-center" className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">All</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="f-type">Type</label>
          <select id="f-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]"><label className="label" htmlFor="f-q">Search</label>
          <input id="f-q" className="input" placeholder="code or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table text-sm">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Center</th><th>Status</th><th>Client</th>{canManage && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canManage ? 7 : 6} className="text-center text-gray-400 py-6">Loading…</td></tr>}
            {!loading && items.map((s) => {
              const alloc = s.allocations?.[0];
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.code}</td>
                  <td>{s.name}</td>
                  <td className="text-xs">{s.type.replace(/_/g, " ")}</td>
                  <td>{s.center?.name}</td>
                  <td><span className={`badge ${STATUS_CLS[s.status] || ""}`}>{s.status}</span></td>
                  <td className="text-xs">{alloc?.client?.companyName || "—"}</td>
                  {canManage && (
                    <td className="space-x-1 whitespace-nowrap">
                      {s.status === "AVAILABLE" && <>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => doAllocate(s)}>Allocate</button>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => doReserve(s)}>Reserve</button>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => setSpaceStatus(s, "MAINTENANCE")}>Maint.</button>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => setSpaceStatus(s, "BLOCKED")}>Block</button>
                      </>}
                      {s.status === "OCCUPIED" && <>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => doTransfer(s)}>Transfer</button>
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => doRelease(s)}>Release</button>
                      </>}
                      {(s.status === "MAINTENANCE" || s.status === "BLOCKED") && (
                        <button type="button" className="btn-ghost text-xs" disabled={busy === s.id} onClick={() => setSpaceStatus(s, "AVAILABLE")}>Make available</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && items.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="text-center text-gray-400 py-8">No spaces match.</td></tr>}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost text-xs disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <button type="button" className="btn-ghost text-xs disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
