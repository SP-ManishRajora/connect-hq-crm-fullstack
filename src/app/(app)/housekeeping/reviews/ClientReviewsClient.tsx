"use client";
import { useMemo, useState } from "react";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  contact: string;
  channel: string;
  reviewerName: string | null;
  companyNameSnapshot: string | null;
  companyVerified: boolean;
  createdAt: string;
  location: { name: string } | null;
  client: { companyName: string } | null;
};

export default function ClientReviewsClient({
  initial, centers, initialCenterId, canModerate,
}: {
  initial: Review[];
  centers: { id: string; name: string }[];
  initialCenterId: string;
  canModerate: boolean;
}) {
  const [rows, setRows] = useState<Review[]>(initial);
  const [centerId, setCenterId] = useState(initialCenterId);
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter === "low" ? rows.filter((r) => r.rating <= 2) : rows),
    [rows, filter],
  );

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const sum = rows.reduce((a, r) => a + r.rating, 0);
    return { avg: (sum / rows.length).toFixed(1), count: rows.length };
  }, [rows]);

  function switchCenter(id: string) {
    // Full navigation — the server re-scopes the query to the chosen centre.
    window.location.href = `/housekeeping/reviews?centerId=${id}`;
    setCenterId(id);
  }

  async function hide(id: string) {
    if (!confirm("Hide this review?\n\nIt stays in the record but is removed from this list.")) return;
    setBusy(id); setErr(null);
    try {
      const r = await fetch(`/api/housekeeping/reviews/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not hide it");
      setRows((s) => s.filter((x) => x.id !== id));
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">⭐ Client Reviews</h1>
        {stats && (
          <div className="rounded-lg border bg-white px-4 py-2 text-center">
            <div className="text-xl font-semibold">{stats.avg}</div>
            <div className="text-[11px] text-gray-500">{stats.count} reviews</div>
          </div>
        )}
      </div>
      <p className="mb-5 text-sm text-gray-500">
        Left from the area QR stickers. Every reviewer confirmed a one-time code, so the
        contact detail is proven — the company they named is self-declared.
      </p>

      {err && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Centre</label>
          <select value={centerId} onChange={(e) => switchCenter(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm">
            {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          {(["all", "low"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-2 text-sm ${
                filter === f ? "border-brand-500 bg-brand-50 font-medium" : "hover:bg-gray-50"}`}>
              {f === "all" ? "All" : "1–2 ★ only"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {shown.map((r) => (
          <div key={r.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm">
                  <span className={r.rating <= 2 ? "text-rose-600" : "text-amber-500"}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                  <span className="ml-2 font-medium">{r.location?.name ?? "—"}</span>
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {r.client?.companyName ?? r.companyNameSnapshot ?? "guest"}
                  {/* Stated plainly: the code proved the contact, not the employer. */}
                  {!r.companyVerified && (
                    <span className="ml-1 text-gray-400">(self-declared)</span>
                  )}
                  {" · "}
                  {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
              {canModerate && (
                <button onClick={() => hide(r.id)} disabled={busy === r.id}
                  className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                  Hide
                </button>
              )}
            </div>

            {r.comment && <p className="mt-2 text-sm text-gray-700">{r.comment}</p>}

            <div className="mt-2 text-[11px] text-gray-400">
              {r.reviewerName ? `${r.reviewerName} · ` : ""}
              ✓ verified {r.channel === "EMAIL" ? "email" : "mobile"} {r.contact}
            </div>
          </div>
        ))}

        {shown.length === 0 && (
          <div className="rounded-xl border bg-white px-4 py-10 text-center text-sm text-gray-500">
            {rows.length === 0
              ? "No reviews yet for this centre. They arrive when members scan an area sticker and leave one."
              : "No reviews match this filter."}
          </div>
        )}
      </div>
    </div>
  );
}
