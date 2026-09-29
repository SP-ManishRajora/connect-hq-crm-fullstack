import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { fmtDateTime } from "@/lib/utils";
import { rangeFromDays } from "@/lib/analytics/report";
import { getPhoneTaps, MAX_TAPS } from "@/lib/analytics/phone";
import {
  CHANNEL_LABELS,
  placementLabel,
  summariseTaps,
  tapAge,
  type Bucket,
  type Channel,
} from "@/lib/analytics/phoneTap";
import LogCallButton from "./LogCallButton";

export const dynamic = "force-dynamic";

/*
 * Website calls.
 *
 * Every tap on a phone number on connecthq.co.in, with how that visitor
 * arrived. Two jobs:
 *
 *   1. For sales, a live list to match an incoming call against. The call
 *      itself carries no campaign; the tap a minute earlier does. "Log call"
 *      creates the lead from the tap, so the campaign and Google click id come
 *      with it.
 *   2. For marketing, which placements, pages and campaigns make people call.
 *
 * A tap is not a call — the visitor may never dial — so "logged" is the number
 * to trust, and the page says so.
 */

const RANGES = [1, 7, 30, 90];
// The list is a working queue, not an archive; the tables above it cover the
// whole range.
const LIST_LIMIT = 200;

const CHANNEL_STYLE: Record<Channel, string> = {
  google_ads: "bg-amber-100 text-amber-800",
  paid: "bg-orange-100 text-orange-800",
  campaign: "bg-indigo-100 text-indigo-800",
  organic_search: "bg-emerald-100 text-emerald-800",
  social: "bg-sky-100 text-sky-800",
  referral: "bg-violet-100 text-violet-800",
  direct: "bg-gray-100 text-gray-700",
};

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(0)}%`;
}

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
      <div className="h-full rounded bg-brand-500" style={{ width: `${w}%` }} />
    </div>
  );
}

function BucketList({ title, rows, empty, hint }: { title: string; rows: Bucket[]; empty: string; hint?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.taps));
  return (
    <div className="card">
      <h2 className="h2 mb-1">{title}</h2>
      {hint && <p className="muted text-xs mb-3">{hint}</p>}
      {rows.length === 0 ? (
        <p className="muted text-sm">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex justify-between text-sm gap-3">
                <span className="truncate font-medium" title={r.label}>{r.label}</span>
                <span className="text-gray-500 whitespace-nowrap">
                  {r.taps.toLocaleString("en-IN")} taps
                  {r.leads > 0 && <span className="text-emerald-600"> · {r.leads} logged</span>}
                </span>
              </div>
              <div className="mt-1"><Bar value={r.taps} max={max} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function WebsiteCallsPage({
  searchParams,
}: {
  searchParams: { days?: string; channel?: string; open?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }
  const canLog = await canAccessAsync(me.role, "leads", me.allowedModules);

  const range = rangeFromDays(Number(searchParams?.days ?? 7));
  const channel = searchParams?.channel && searchParams.channel in CHANNEL_LABELS
    ? (searchParams.channel as Channel)
    : null;
  const openOnly = searchParams?.open === "1";

  const { taps: all, truncated } = await getPhoneTaps(range);
  const summary = summariseTaps(all);

  const filtered = all.filter((t) => (!channel || t.channel === channel) && (!openOnly || !t.lead));
  const list = filtered.slice(0, LIST_LIMIT);
  const now = new Date();

  const href = (p: { days?: number; channel?: string | null; open?: boolean }) => {
    const q = new URLSearchParams();
    q.set("days", String(p.days ?? range.days));
    const c = p.channel === undefined ? channel : p.channel;
    if (c) q.set("channel", c);
    if (p.open ?? openOnly) q.set("open", "1");
    return `/analytics/calls?${q.toString()}`;
  };

  const stats = [
    { label: "Phone taps", value: summary.taps.toLocaleString("en-IN"), hint: "Taps on a call link" },
    { label: "Visitors", value: summary.visitors.toLocaleString("en-IN"), hint: "Distinct people tapping" },
    { label: "From paid ads", value: summary.paidTaps.toLocaleString("en-IN"), hint: pct(summary.paidTaps, summary.taps) + " of taps" },
    { label: "Logged as calls", value: summary.logged.toLocaleString("en-IN"), hint: "Matched to a real call" },
    { label: "Logged rate", value: pct(summary.logged, summary.visitors), hint: "Of distinct visitors" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Website Calls</h1>
          <p className="muted">
            Taps on the phone number at connecthq.co.in,{" "}
            {range.days === 1 ? "last 24 hours" : `last ${range.days} days`}.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={href({ days: d })}
              className={d === range.days ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {d === 1 ? "24h" : `${d}d`}
            </Link>
          ))}
          <Link href="/analytics/funnel" className="btn-ghost text-sm ml-2">Funnel</Link>
        </div>
      </div>

      {truncated && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-800">
          More than {MAX_TAPS.toLocaleString("en-IN")} taps in this range — only the most recent are
          shown and counted. That is far above normal and may be junk traffic to the tracker.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-xs font-semibold text-gray-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="h2">Recent taps</h2>
            <p className="muted text-xs mt-1">
              Got a call? Find the tap from a minute or two before it and choose <strong>Log call</strong> —
              the lead is created with the visitor&apos;s campaign and Google click attached.
              A tap is not proof of a call: some visitors never dial.
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap text-xs">
            <Link href={href({ channel: null })} className={`badge ${!channel ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"}`}>
              All
            </Link>
            {summary.byChannel.map((c) => (
              <Link
                key={c.key}
                href={href({ channel: c.key })}
                className={`badge ${channel === c.key ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {c.label} · {c.taps}
              </Link>
            ))}
            <Link
              href={href({ open: !openOnly })}
              className={`badge ml-2 ${openOnly ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"}`}
              title="Hide taps already logged as a call"
            >
              Not logged only
            </Link>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="muted text-sm">
            {all.length === 0
              ? "No phone taps in this range. If the website has had visitors, check that chq-track.js is live on it."
              : "No taps match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Came from</th>
                  <th className="py-2 pr-3">Campaign / keyword</th>
                  <th className="py-2 pr-3">Tapped on</th>
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 text-right">Lead</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const recent = now.getTime() - t.occurredAt.getTime() < 30 * 60 * 1000;
                  const summaryLine =
                    `${fmtDateTime(t.occurredAt)} · ${CHANNEL_LABELS[t.channel]}` +
                    (t.utmCampaign ? ` · ${t.utmCampaign}` : "") +
                    ` · ${placementLabel(t.place)} on ${t.path}` +
                    (t.device ? ` · ${t.device}` : "");
                  return (
                    <tr key={t.id} className={`border-b last:border-0 ${recent && !t.lead ? "bg-amber-50/60" : ""}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <div className="font-medium">{fmtDateTime(t.occurredAt)}</div>
                        <div className={`text-xs ${recent ? "text-amber-700 font-semibold" : "text-gray-400"}`}>
                          {tapAge(t.occurredAt, now)}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`badge ${CHANNEL_STYLE[t.channel]}`}>{CHANNEL_LABELS[t.channel]}</span>
                        {t.utmSource && <div className="text-xs text-gray-400 mt-0.5">{t.utmSource}{t.utmMedium ? ` / ${t.utmMedium}` : ""}</div>}
                      </td>
                      <td className="py-2 pr-3 max-w-[16rem]">
                        <div className="truncate" title={t.utmCampaign ?? ""}>{t.utmCampaign || <span className="text-gray-400">—</span>}</div>
                        {t.utmTerm && <div className="text-xs text-gray-500 truncate" title={t.utmTerm}>“{t.utmTerm}”</div>}
                      </td>
                      <td className="py-2 pr-3 max-w-[16rem]">
                        <div className="truncate font-medium" title={t.path}>{t.path}</div>
                        <div className="text-xs text-gray-400">{placementLabel(t.place)}</div>
                      </td>
                      <td className="py-2 pr-3 capitalize text-gray-600">{t.device || "—"}</td>
                      <td className="py-2 text-right">
                        {t.lead ? (
                          <Link href={`/leads/${t.lead.id}`} className="text-brand-700 hover:underline font-medium">
                            {t.lead.name}
                            <div className="text-xs text-gray-400 font-normal">{t.lead.status}</div>
                          </Link>
                        ) : (
                          <LogCallButton tapId={t.id} summary={summaryLine} canLog={canLog} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > list.length && (
              <p className="muted text-xs mt-2">
                Showing the latest {list.length} of {filtered.length.toLocaleString("en-IN")} taps. Narrow the range to see older ones.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BucketList
          title="Where on the page"
          rows={summary.byPlacement}
          empty="No taps yet."
          hint="Which call link people use — judge the sticky bar and header on this."
        />
        <BucketList title="How they arrived" rows={summary.byChannel} empty="No taps yet." />
        <BucketList title="Pages" rows={summary.byPage} empty="No taps yet." hint="Top 10 pages by taps." />
        <BucketList title="Campaigns" rows={summary.byCampaign} empty="No taps yet." hint="Top 10 utm_campaign values by taps." />
      </div>

      <p className="muted text-xs">
        Recorded by the website&apos;s own tracker, so ad-blockers hide some taps — treat these counts as a
        floor. The same tap is also sent to Google Tag Manager for the Ads “Clicks on number” conversion.
      </p>
    </div>
  );
}
