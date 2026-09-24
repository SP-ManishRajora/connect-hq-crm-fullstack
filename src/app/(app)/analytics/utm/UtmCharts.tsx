"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

/*
 * Charts for the UTM explorer.
 *
 * Client components because Recharts measures the DOM to size itself. Kept in
 * one file so the page stays a server component and only this boundary ships
 * the library to the browser.
 *
 * The palette is fixed and ordered rather than random per render: a campaign
 * that is blue in the trend chart must be blue in the bar chart beside it, or
 * the two cannot be read together.
 */

const PALETTE = [
  "#4f46e5", // brand-600
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
];

export function colourFor(i: number): string {
  return PALETTE[i % PALETTE.length];
}

const axis = { fontSize: 11, fill: "#6b7280" };

/** Shared tooltip styling — the default is a stark white box with no radius. */
const tooltipStyle = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 12px rgb(0 0 0 / 8%)",
  },
};

/**
 * Leads (or customers) over time, one line per dimension value.
 *
 * A line chart rather than stacked bars: the question is whether a campaign is
 * rising or decaying, and stacking makes each series' own shape unreadable.
 */
export function TrendChart({
  points,
  series,
  metric,
}: {
  points: Record<string, string | number>[];
  series: string[];
  metric: string;
}) {
  if (!points.length || !series.length) {
    return <p className="muted text-sm">Not enough data to draw a trend.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 5, right: 10, bottom: 5, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="period" tick={axis} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
        {/* allowDecimals=false: a count of leads is never 2.5, and the default
            axis invents fractional ticks on small numbers. */}
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [v, n]} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            name={s}
            stroke={colourFor(i)}
            strokeWidth={2}
            dot={false}
            // Without this a series that is 0 for a week vanishes rather than
            // drawing along the axis.
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Leads vs customers per dimension value.
 *
 * Two bars side by side rather than a conversion-rate bar: a 100% rate on one
 * lead is not the same as 30% on fifty, and a single rate bar hides which is
 * which.
 */
export function BreakdownChart({
  rows,
}: {
  rows: { value: string; leads: number; customers: number }[];
}) {
  if (!rows.length) return <p className="muted text-sm">Nothing to chart in this range.</p>;

  const data = rows.slice(0, 10).map((r) => ({
    // Long keywords and ad names blow out the axis; the tooltip has the full one.
    name: r.value.length > 22 ? r.value.slice(0, 21) + "…" : r.value,
    full: r.value,
    Leads: r.leads,
    Customers: r.customers,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={axis}
          tickLine={false}
          axisLine={false}
          width={150}
        />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(_, p) => (p?.[0]?.payload?.full as string) ?? ""}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Leads" fill="#c7d2fe" radius={[0, 3, 3, 0]} />
        <Bar dataKey="Customers" fill="#4f46e5" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Share of leads by channel.
 *
 * A horizontal bar rather than a pie: comparing angles is harder than
 * comparing lengths, and channel lists here run past the four-or-five slices a
 * pie can carry legibly.
 */
export function ShareChart({
  rows,
}: {
  rows: { label: string; leads: number }[];
}) {
  if (!rows.length) return <p className="muted text-sm">No channel data in this range.</p>;

  const data = rows.slice(0, 8).map((r) => ({
    name: r.label.length > 24 ? r.label.slice(0, 23) + "…" : r.label,
    full: r.label,
    Leads: r.leads,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={150} />
        <Tooltip {...tooltipStyle} labelFormatter={(_, p) => (p?.[0]?.payload?.full as string) ?? ""} />
        <Bar dataKey="Leads" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colourFor(i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
