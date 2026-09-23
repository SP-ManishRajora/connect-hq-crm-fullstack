import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { fmtINR } from "@/lib/utils";
import { rangeFromDays } from "@/lib/analytics/report";
import {
  getFunnelCounts,
  buildFunnel,
  getChannelFunnel,
  getCampaignFunnel,
} from "@/lib/analytics/funnel";
import { isAdsConfigured } from "@/lib/analytics/ads";
import UploadConversions from "./UploadConversions";

export const dynamic = "force-dynamic";

/*
 * The conversion funnel: ad click → enquiry → qualified → customer.
 *
 * The page is organised around one honest distinction. Numbers above the CRM
 * line come from the visitor's browser and are suppressed by ad-blockers;
 * numbers from the CRM line down are rows we hold. They are shown in separate
 * blocks, labelled with their source, rather than chained into a single
 * conversion rate that would quietly divide one population by another.
 */

const RANGES = [7, 30, 90];

function pctText(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }

  const range = rangeFromDays(Number(searchParams?.days ?? 30));
  const [counts, channels, campaigns] = await Promise.all([
    getFunnelCounts(range),
    getChannelFunnel(range),
    getCampaignFunnel(range),
  ]);

  const stages = buildFunnel(counts);
  const maxStage = Math.max(1, ...stages.map((s) => s.value));
  const adsReady = isAdsConfigured();

  // The top-of-funnel signals, each measured where it actually happens.
  const signals = [
    { label: "Website form", value: counts.websiteFormSubmits, src: "Website", approx: true },
    { label: "WhatsApp clicks", value: counts.whatsappClicks, src: "Website", approx: true },
    { label: "Phone clicks", value: counts.phoneClicks, src: "Website", approx: true },
    { label: "Calls from ads", value: counts.callsFromAds, src: "Telephony", approx: false },
    { label: "Calls from website", value: counts.callsFromWebsite, src: "Telephony", approx: false },
    { label: "Google lead forms", value: counts.googleLeadFormLeads, src: "Google Ads", approx: false },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Conversion Funnel</h1>
          <p className="muted">
            Ad click to paying customer, last {range.days} days.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/analytics/funnel?days=${d}`}
              className={d === range.days ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {d}d
            </Link>
          ))}
          <Link href="/analytics" className="btn-ghost text-sm ml-2">Traffic</Link>
        </div>
      </div>

      {/* ── Where enquiries come from ─────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">Incoming signals</h2>
        <p className="muted text-xs mb-3">
          Each counted where it happens. Website figures are suppressed by ad-blockers and
          are a floor, not a total; telephony and Google Ads figures are exact.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {signals.map((s) => (
            <div key={s.label} className="rounded border p-3">
              <div className="text-xs font-semibold text-gray-500">{s.label}</div>
              <div className="mt-1 text-xl font-bold text-gray-900">
                {s.value.toLocaleString("en-IN")}
                {s.approx && s.value > 0 && <span className="text-xs text-gray-400 font-normal">+</span>}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{s.src}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── The funnel itself ─────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-3">Funnel</h2>
        <div className="space-y-3">
          {stages.map((s, i) => (
            <div key={s.key}>
              <div className="flex justify-between items-baseline text-sm gap-3">
                <span className="font-medium">
                  {s.label}
                  {s.approximate && <span className="muted text-xs"> · approximate</span>}
                </span>
                <span className="whitespace-nowrap">
                  <span className="font-bold">{s.value.toLocaleString("en-IN")}</span>
                  {s.rate !== null && (
                    <span className="text-gray-500 text-xs"> · {pctText(s.rate)} of previous</span>
                  )}
                </span>
              </div>
              <div className="h-6 bg-gray-100 rounded mt-1 overflow-hidden">
                <div
                  className={`h-full rounded flex items-center px-2 ${
                    s.approximate ? "bg-gray-400" : i === stages.length - 1 ? "bg-emerald-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${Math.max((s.value / maxStage) * 100, s.value > 0 ? 3 : 0)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">{s.hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="muted text-xs">Lost</div>
            <div className="font-bold">{counts.lostLeads.toLocaleString("en-IN")}</div>
          </div>
          <div>
            <div className="muted text-xs">Won value</div>
            <div className="font-bold">{fmtINR(counts.wonValue)}</div>
          </div>
          <div>
            <div className="muted text-xs">With GCLID</div>
            <div className="font-bold">{counts.leadsWithGclid.toLocaleString("en-IN")}</div>
          </div>
          <div>
            <div className="muted text-xs">With UTM</div>
            <div className="font-bold">{counts.leadsWithUtm.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      {/* ── Offline conversions ───────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">Offline conversions</h2>
        <p className="muted text-xs mb-3">
          Telling Google which clicks became customers. Until this is sent, Ads optimises
          towards form fills rather than revenue.
        </p>
        <UploadConversions
          configured={adsReady}
          pending={counts.conversionsPending}
          uploaded={counts.conversionsUploaded}
        />
      </div>

      {/* ── By channel ────────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-3">By channel</h2>
        {channels.length === 0 ? (
          <p className="muted text-sm">No leads in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Channel</th>
                  <th className="py-2 text-right">Leads</th>
                  <th className="py-2 text-right">Qualified</th>
                  <th className="py-2 text-right">Customers</th>
                  <th className="py-2 text-right">Win rate</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.channel}</td>
                    <td className="py-2 text-right">{c.leads.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">{c.qualified.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right font-semibold">{c.customers.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right text-gray-500">
                      {c.leads ? `${((c.customers / c.leads) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 text-right">{c.value ? fmtINR(c.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── By campaign ───────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="h2 mb-1">By campaign</h2>
        <p className="muted text-xs mb-3">
          Sorted by customers, not leads — a campaign with many enquiries and no customers
          is the expensive one.
        </p>
        {campaigns.length === 0 ? (
          <p className="muted text-sm">No campaign-attributed leads in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Campaign</th>
                  <th className="py-2">Source</th>
                  <th className="py-2 text-right">Leads</th>
                  <th className="py-2 text-right">Qualified</th>
                  <th className="py-2 text-right">Customers</th>
                  <th className="py-2 text-right">Value</th>
                  <th className="py-2 text-right" title="Leads carrying a Google click id — how many can be reported back to Ads">
                    Uploadable
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaign} className="border-b last:border-0">
                    <td className="py-2 font-medium break-all">{c.campaign}</td>
                    <td className="py-2 text-gray-500">{c.source}</td>
                    <td className="py-2 text-right">{c.leads.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">{c.qualified.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right font-semibold">{c.customers.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right">{c.value ? fmtINR(c.value) : "—"}</td>
                    <td className="py-2 text-right text-gray-500">
                      {c.withGclid}/{c.leads}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
