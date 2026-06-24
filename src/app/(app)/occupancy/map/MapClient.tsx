"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

type Center = { id: string; name: string };
type ClientLite = { id: string; companyName: string };
type Space = {
  id: string; code: string; name: string; type: string; status: string;
  center: { id: string; name: string };
  allocations: { id: string; client: { id: string; companyName: string } | null; endDate: string | null }[];
  reservedFor?: string | null;
  reservedUntil?: string | null;
};
type Group = { centerId: string; centerName: string; spaces: Space[] };

const TYPES = ["DEDICATED_SEAT", "HOT_DESK", "CABIN", "MEETING_ROOM", "PRIVATE_OFFICE", "VIRTUAL_OFFICE"];
const STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE", "BLOCKED"];

// Tile fill per status — the 5-color legend.
const TILE: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  OCCUPIED: "bg-rose-500",
  RESERVED: "bg-amber-500",
  MAINTENANCE: "bg-gray-300",
  BLOCKED: "bg-gray-900",
};
const LEGEND = [
  ["AVAILABLE", "Available"], ["OCCUPIED", "Occupied"], ["RESERVED", "Reserved"],
  ["MAINTENANCE", "Maintenance"], ["BLOCKED", "Blocked"],
];

const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);

// Short label for a client name to fit on a small tile, e.g. "Acme Corp" → "AC".
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function MapClient({ centers, clients, canManage }: { centers: Center[]; clients: ClientLite[]; canManage: boolean }) {
  const [centerId, setCenterId] = useState(centers[0]?.id || "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState(1);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (centerId) p.set("centerId", centerId);
    if (type) p.set("type", type);
    if (status) p.set("status", status);
    if (q.trim()) p.set("q", q.trim());
    try {
      const r = await fetch(`/api/occupancy/map?${p.toString()}`);
      setGroups(r.ok ? (await r.json()).groups : []);
    } finally {
      setLoading(false);
    }
  }, [centerId, type, status, q]);

  useEffect(() => { load(); }, [load]);

  const clientOptions = clients.map((c) => `<option value="${c.id}">${c.companyName}</option>`).join("");

  async function run(url: string, body: any, method: "POST" | "PUT" | "DELETE" = "POST") {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { await Swal.fire({ icon: "success", title: "Done", timer: 1200, showConfirmButton: false }); await load(); }
    else Swal.fire({ icon: "error", title: "Failed", text: j.error || `HTTP ${r.status}`, confirmButtonColor: "#4f46e5" });
  }

  // Click a tile → detail + contextual actions.
  async function openSpace(s: Space) {
    const alloc = s.allocations?.[0];
    const detail =
      `<div style="text-align:left;font-size:13px;line-height:1.7">
        <b>${s.code}</b> — ${s.name}<br/>
        Type: ${s.type.replace(/_/g, " ")}<br/>
        Status: <b>${s.status}</b><br/>
        ${alloc?.client ? `Client: ${alloc.client.companyName}<br/>` : ""}
        ${s.status === "RESERVED" && s.reservedFor ? `Reserved for: <b>${s.reservedFor}</b><br/>` : ""}
        Center: ${s.center.name}
      </div>`;

    if (!canManage) { await Swal.fire({ title: s.code, html: detail, confirmButtonColor: "#4f46e5" }); return; }

    const actions: Record<string, string> = {};
    if (s.status === "AVAILABLE") { actions.allocate = "Allocate"; actions.reserve = "Reserve"; actions.maintenance = "Maintenance"; actions.block = "Block"; }
    else if (s.status === "OCCUPIED") { actions.transfer = "Transfer"; actions.release = "Release"; }
    else if (s.status === "MAINTENANCE" || s.status === "BLOCKED") { actions.available = "Make available"; }

    const res = await Swal.fire({
      title: s.code,
      html: detail,
      showCancelButton: true,
      confirmButtonText: "Close",
      confirmButtonColor: "#6b7280",
      footer: Object.entries(actions).map(([k, label]) => `<button id="act-${k}" class="swal2-styled" style="background:#4f46e5;margin:2px">${label}</button>`).join(""),
      didOpen: () => {
        Object.keys(actions).forEach((k) => {
          document.getElementById(`act-${k}`)?.addEventListener("click", () => { Swal.close(); handleAction(k, s); });
        });
      },
    });
    void res;
  }

  async function handleAction(action: string, s: Space) {
    if (action === "allocate") {
      const { value: f } = await Swal.fire({
        title: `Allocate ${s.code}`, focusConfirm: false, showCancelButton: true, confirmButtonColor: "#4f46e5", confirmButtonText: "Allocate",
        html: `<select id="c" class="swal2-input"><option value="">— client —</option>${clientOptions}</select>
               <input id="sd" type="date" class="swal2-input" value="${todayISO()}">
               <input id="ed" type="date" class="swal2-input" placeholder="End (optional)">`,
        preConfirm: () => {
          const clientId = (document.getElementById("c") as HTMLSelectElement).value;
          const start = (document.getElementById("sd") as HTMLInputElement).value;
          const end = (document.getElementById("ed") as HTMLInputElement).value;
          if (!clientId || !start) { Swal.showValidationMessage("Client and start date required"); return false; }
          return { clientId, start, end };
        },
      });
      if (f) await run("/api/occupancy/allocations", { clientId: f.clientId, items: [{ spaceId: s.id, seatsTaken: 1 }], startDate: f.start, endDate: f.end || null });
    } else if (action === "reserve") {
      const { value: f } = await Swal.fire({
        title: `Reserve ${s.code}`, focusConfirm: false, showCancelButton: true, confirmButtonColor: "#4f46e5", confirmButtonText: "Reserve",
        html: `<select id="rc" class="swal2-input"><option value="">— Held for client (optional) —</option>${clientOptions}</select>
               <input id="ex" type="date" class="swal2-input" value="${todayISO(new Date(Date.now() + 7 * 86400000))}">`,
        preConfirm: () => {
          const expiresAt = (document.getElementById("ex") as HTMLInputElement).value;
          const clientId = (document.getElementById("rc") as HTMLSelectElement).value;
          if (!expiresAt) { Swal.showValidationMessage("Expiry required"); return false; }
          return { expiresAt, clientId };
        },
      });
      if (f) await run("/api/occupancy/reservations", { spaceId: s.id, expiresAt: f.expiresAt, clientId: f.clientId || null });
    } else if (action === "transfer") {
      const { value: f } = await Swal.fire({
        title: `Transfer ${s.code}`, focusConfirm: false, showCancelButton: true, confirmButtonColor: "#4f46e5", confirmButtonText: "Transfer",
        html: `<select id="tc" class="swal2-input"><option value="">— to client —</option>${clientOptions}</select>`,
        preConfirm: () => {
          const toClientId = (document.getElementById("tc") as HTMLSelectElement).value;
          if (!toClientId) { Swal.showValidationMessage("Pick a client"); return false; }
          return { toClientId };
        },
      });
      if (f) await run("/api/occupancy/transfers", { items: [{ spaceId: s.id, toClientId: f.toClientId, seatsTaken: 1 }] });
    } else if (action === "release") {
      const alloc = s.allocations?.[0];
      if (alloc) await run(`/api/occupancy/allocations/${alloc.id}`, { reason: "TERMINATED" }, "DELETE");
    } else if (action === "maintenance") {
      await run(`/api/occupancy/spaces/${s.id}`, { status: "MAINTENANCE" }, "PUT");
    } else if (action === "block") {
      await run(`/api/occupancy/spaces/${s.id}`, { status: "BLOCKED" }, "PUT");
    } else if (action === "available") {
      await run(`/api/occupancy/spaces/${s.id}`, { status: "AVAILABLE" }, "PUT");
    }
  }

  const tilePx = Math.round(40 * zoom);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Occupancy Map</h1>
          <p className="muted">Click a space to view details{canManage ? " and act" : ""}.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/occupancy/spaces" className="btn-ghost text-sm">Table view</Link>
          <Link href="/occupancy" className="btn-ghost text-sm">← Dashboard</Link>
        </div>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="m-center">Center</label>
          <select id="m-center" className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">All</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="m-type">Type</label>
          <select id="m-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="m-status">Status</label>
          <select id="m-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]"><label className="label" htmlFor="m-q">Search</label>
          <input id="m-q" className="input" placeholder="code or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost text-xs" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}>−</button>
          <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn-ghost text-xs" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))}>+</button>
        </div>
      </div>

      {/* Legend */}
      <div className="card flex flex-wrap gap-4 text-xs">
        {LEGEND.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded ${TILE[k]}`}></span> {label}</span>
        ))}
      </div>

      {loading && <div className="card muted">Loading…</div>}
      {!loading && groups.length === 0 && <div className="card text-gray-400">No spaces match.</div>}

      {!loading && groups.map((g) => (
        <div key={g.centerId} className="card space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="h2">{g.centerName}</h2>
            <span className="muted text-sm">{g.spaces.length} spaces · {g.spaces.filter((s) => s.status === "OCCUPIED").length} occupied</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {g.spaces.map((s) => {
              const occClient = s.allocations?.[0]?.client?.companyName;
              const heldClient = s.status === "RESERVED" ? s.reservedFor : null;
              const who = occClient || heldClient || null;
              const tip = `${s.code} — ${s.status}` + (who ? ` — ${who}` : "") + (heldClient ? " (reserved)" : "");
              // On a reserved/occupied tile show the client's initials so the holder is visible at a glance.
              const label = who ? initials(who) : s.code.replace(/^(SEAT|CABIN|ROOM)-/, "");
              return (
              <button
                key={s.id}
                type="button"
                onClick={() => openSpace(s)}
                title={tip}
                className={`${TILE[s.status] || "bg-gray-200"} text-white rounded flex items-center justify-center hover:ring-2 hover:ring-brand-500 transition`}
                style={{ width: tilePx, height: tilePx, fontSize: Math.max(7, Math.round(8 * zoom)) }}
              >
                {label}
              </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
