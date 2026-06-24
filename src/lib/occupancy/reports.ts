import { prisma } from "@/lib/db";
import { Prisma, SpaceStatus } from "@prisma/client";

// Report builders. Each returns a uniform { title, columns, rows } shape so the API can
// render it as JSON, CSV, or print-to-PDF HTML without per-report formatting code.

export type ReportTable = {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
};

export const REPORT_TYPES = [
  "occupancy",        // per-center: total / occupied / available / reserved / occupancy%
  "vacancy",          // available + reserved spaces (the vacant inventory)
  "utilization",      // per-center utilization %
  "client-occupancy", // per active allocation: client, space, dates
  "revenue",          // per-center monthly revenue from active-allocation contracts
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(x: string): x is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(x);
}

export async function buildReport(type: ReportType, centerId?: string | null): Promise<ReportTable> {
  const centerFilter = centerId ? { centerId } : {};

  if (type === "occupancy" || type === "utilization") {
    const centers = await prisma.center.findMany({
      where: centerId ? { id: centerId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const rows = [];
    for (const c of centers) {
      const grouped = await prisma.space.groupBy({
        by: ["status"], where: { centerId: c.id, deletedAt: null }, _count: true,
      });
      const m: Record<string, number> = {};
      grouped.forEach((g) => { m[g.status] = g._count; });
      const total = Object.values(m).reduce((a, b) => a + b, 0);
      const occ = m[SpaceStatus.OCCUPIED] ?? 0;
      const pct = total ? Math.round((occ / total) * 100) : 0;
      if (type === "utilization") {
        rows.push({ center: c.name, total, occupied: occ, "utilization%": pct });
      } else {
        rows.push({
          center: c.name, total, occupied: occ,
          available: m[SpaceStatus.AVAILABLE] ?? 0,
          reserved: m[SpaceStatus.RESERVED] ?? 0,
          "occupancy%": pct,
        });
      }
    }
    return type === "utilization"
      ? { title: "Center Utilization", columns: [
          { key: "center", label: "Center" }, { key: "total", label: "Total" },
          { key: "occupied", label: "Occupied" }, { key: "utilization%", label: "Utilization %" }], rows }
      : { title: "Occupancy Report", columns: [
          { key: "center", label: "Center" }, { key: "total", label: "Total" },
          { key: "occupied", label: "Occupied" }, { key: "available", label: "Available" },
          { key: "reserved", label: "Reserved" }, { key: "occupancy%", label: "Occupancy %" }], rows };
  }

  if (type === "vacancy") {
    const spaces = await prisma.space.findMany({
      where: { deletedAt: null, status: { in: [SpaceStatus.AVAILABLE, SpaceStatus.RESERVED] }, ...centerFilter },
      select: { code: true, name: true, type: true, status: true, center: { select: { name: true } } },
      orderBy: [{ centerId: "asc" }, { code: "asc" }],
    });
    return {
      title: "Vacancy Report",
      columns: [
        { key: "center", label: "Center" }, { key: "code", label: "Code" },
        { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "status", label: "Status" },
      ],
      rows: spaces.map((s) => ({ center: s.center.name, code: s.code, name: s.name, type: s.type, status: s.status })),
    };
  }

  if (type === "client-occupancy") {
    const allocs = await prisma.allocation.findMany({
      where: { status: "ACTIVE", deletedAt: null, ...(centerId ? { space: { centerId } } : {}) },
      select: {
        startDate: true, endDate: true, seatsTaken: true,
        client: { select: { companyName: true } },
        space: { select: { code: true, type: true, center: { select: { name: true } } } },
      },
      orderBy: { startDate: "desc" },
    });
    return {
      title: "Client Occupancy",
      columns: [
        { key: "client", label: "Client" }, { key: "center", label: "Center" },
        { key: "space", label: "Space" }, { key: "type", label: "Type" },
        { key: "seats", label: "Seats" }, { key: "start", label: "Start" }, { key: "end", label: "End" },
      ],
      rows: allocs.map((a) => ({
        client: a.client.companyName, center: a.space.center.name, space: a.space.code, type: a.space.type,
        seats: a.seatsTaken,
        start: a.startDate.toISOString().slice(0, 10),
        end: a.endDate ? a.endDate.toISOString().slice(0, 10) : "—",
      })),
    };
  }

  // revenue
  const centers = await prisma.center.findMany({
    where: centerId ? { id: centerId } : {}, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const rows = [];
  for (const c of centers) {
    const allocs = await prisma.allocation.findMany({
      where: { status: "ACTIVE", deletedAt: null, space: { centerId: c.id } },
      select: { contractId: true, contract: { select: { monthlyRent: true } } },
    });
    const seen = new Set<string>();
    let revenue = 0;
    let occupied = 0;
    for (const a of allocs) {
      occupied++;
      if (a.contractId && a.contract && !seen.has(a.contractId)) { seen.add(a.contractId); revenue += a.contract.monthlyRent; }
    }
    rows.push({ center: c.name, occupied, "monthlyRevenue": Math.round(revenue), "revenuePerSeat": occupied ? Math.round(revenue / occupied) : 0 });
  }
  return {
    title: "Revenue per Center",
    columns: [
      { key: "center", label: "Center" }, { key: "occupied", label: "Occupied Seats" },
      { key: "monthlyRevenue", label: "Monthly Revenue" }, { key: "revenuePerSeat", label: "Revenue / Seat" },
    ],
    rows,
  };
}

// ---- Renderers ----

export function toCSV(t: ReportTable): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = t.columns.map((c) => esc(c.label)).join(",");
  const lines = t.rows.map((r) => t.columns.map((c) => esc(r[c.key] ?? "")).join(","));
  return [header, ...lines].join("\n");
}

// Print-friendly HTML (browser "Save as PDF"), matching the app's existing HTML→PDF approach.
export function toPrintableHTML(t: ReportTable): string {
  const head = t.columns.map((c) => `<th>${c.label}</th>`).join("");
  const body = t.rows
    .map((r) => `<tr>${t.columns.map((c) => `<td>${r[c.key] ?? ""}</td>`).join("")}</tr>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t.title}</title>
<style>
  @page { margin: 14mm; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a2e; }
  h1 { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; }
  .meta { color: #666; font-size: 11px; margin-bottom: 12px; }
  @media screen { .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; background: #4f46e5; color: #fff; border: 0; border-radius: 6px; cursor: pointer; } }
  @media print { .print-btn { display: none; } }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  <h1>${t.title}</h1>
  <div class="meta">${t.rows.length} rows</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}
