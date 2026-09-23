import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import {
  isGaConfigured,
  getGaReport,
  getGaRealtimeUsers,
  explainGaError,
  type GaRow,
} from "@/lib/analytics/ga";

export const dynamic = "force-dynamic";

/*
 * Google Analytics dashboard.
 *
 * The numbers here come from Google, not from our own WebEvent table, and the
 * page says so in every panel heading. The sibling page at /analytics reports
 * what /api/track collected; the two will differ, and a reader who assumes they
 * are the same figure measured twice will draw wrong conclusions from the gap.
 */

const RANGES = [7, 30, 90];

function rangeFromDays(days: number) {
  const d = Number.isFinite(days) ? Math.floor(days) : 30;
  const clamped = Math.min(Math.max(d, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - clamped * 24 * 60 * 60 * 1000);
  return { from, to, days: clamped };
}

function duration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}

/** Inline bar, sized as a share of the largest row. Avoids a chart dependency. */
function Bar({ value, max, className = "bg-brand-500" }: { value: number; max: number; className?: string }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
      <div className={`h-full rounded ${className}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Breakdown({ title, hint, rows }: { title: string; hint: string; rows: GaRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <div className="card">
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-400 mb-3">{hint}</div>
      {rows.length === 0 ? (
        <p className="muted text-sm">No data in this range.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-sm gap-3">
                <span className="truncate text-gray-700" title={r.label}>{r.label}</span>
                <span className="font-semibold text-gray-900 shrink-0">
                  {r.sessions.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="mt-1">
                <Bar value={r.sessions} max={max} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown on a fresh install: what to do, in the order it has to be done. */
function SetupGuide() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Google Analytics</h1>
        <p className="muted">Not connected yet.</p>
      </div>
      <div className="card border-amber-300 bg-amber-50">
        <div className="font-semibold text-amber-900">Connect a GA4 property</div>
        <p className="text-sm text-amber-800 mt-1">
          The tag on the website sends data to Google. To read it back here, this server
          needs its own read-only credentials — the tag alone does not grant access.
        </p>
      </div>
      <div className="card">
        <div className="font-semibold text-gray-900 mb-3">Setup</div>
        <ol className="text-sm text-gray-700 space-y-3 list-decimal ml-5">
          <li>
            In the <b>Google Cloud console</b>, create a project (or reuse one) and enable
            the <b>Google Analytics Data API</b>.
          </li>
          <li>
            Create a <b>service account</b>, then create a <b>JSON key</b> for it and download it.
          </li>
          <li>
            In <b>Google Analytics → Admin → Property access management</b>, add that service
            account&rsquo;s email address with the <b>Viewer</b> role.
          </li>
          <li>
            In <b>Admin → Property settings</b>, copy the numeric <b>Property ID</b>. This is a
            number like <code className="bg-gray-100 px-1 rounded">493820114</code> — not the
            <code className="bg-gray-100 px-1 rounded ml-1">G-XXXXXXX</code> measurement ID.
          </li>
          <li>
            Add these to <code className="bg-gray-100 px-1 rounded">.env</code>, then restart the
            server:
            <pre className="mt-2 bg-gray-900 text-gray-100 rounded p-3 text-xs overflow-x-auto">{`GA_PROPERTY_ID="493820114"
GA_CLIENT_EMAIL="erp-analytics@your-project.iam.gserviceaccount.com"
GA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEv...\\n-----END PRIVATE KEY-----\\n"`}</pre>
            <p className="mt-2 text-gray-500">
              Copy <code className="bg-gray-100 px-1 rounded">client_email</code> and{" "}
              <code className="bg-gray-100 px-1 rounded">private_key</code> straight out of the
              JSON key file. Keep the private key on one line, in double quotes, with its{" "}
              <code className="bg-gray-100 px-1 rounded">\n</code> sequences exactly as they
              appear in the file.
            </p>
          </li>
        </ol>
      </div>
      <p className="muted text-sm">
        In the meantime, <Link href="/analytics" className="text-brand-600 underline">Website Analytics</Link>{" "}
        reports the events our own tracker collects, which needs no Google credentials.
      </p>
    </div>
  );
}

export default async function GoogleAnalyticsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "analytics", me.allowedModules))) {
    return <div className="card">You don’t have access to the Website Analytics module.</div>;
  }

  if (!isGaConfigured()) return <SetupGuide />;

  const range = rangeFromDays(Number(searchParams?.days ?? 30));

  // A credential or quota problem is the likely failure here, and it must read
  // as a broken connection rather than as a quiet week of zero traffic.
  let report: Awaited<ReturnType<typeof getGaReport>> | null = null;
  let error: string | null = null;
  let live: number | null = null;
  try {
    [report, live] = await Promise.all([getGaReport(range), getGaRealtimeUsers()]);
  } catch (e) {
    error = explainGaError(e);
  }

  if (error || !report) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="h1">Google Analytics</h1>
            <p className="muted">Could not load data from Google.</p>
          </div>
          <Link href="/analytics" className="btn-ghost text-sm">Website Analytics</Link>
        </div>
        <div className="card border-red-300 bg-red-50">
          <div className="font-semibold text-red-900">Google rejected the request</div>
          <p className="text-sm text-red-800 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const t = report.totals;
  const maxDay = Math.max(1, ...report.daily.map((d) => d.sessions));
  const maxPage = Math.max(1, ...report.pages.map((p) => p.views));

  const stats = [
    { label: "Sessions", value: t.sessions.toLocaleString("en-IN"), hint: "Visits" },
    { label: "Users", value: t.users.toLocaleString("en-IN"), hint: "Distinct people" },
    { label: "New users", value: t.newUsers.toLocaleString("en-IN"), hint: "First-time" },
    { label: "Page views", value: t.pageViews.toLocaleString("en-IN"), hint: "Screens seen" },
    { label: "Conversions", value: t.conversions.toLocaleString("en-IN"), hint: "GA key events" },
    { label: "Avg. session", value: duration(t.avgSessionDuration), hint: "Time on site" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Google Analytics</h1>
          <p className="muted">
            Reported by Google for connecthq.co.in, last {range.days} days.
            {live !== null && (
              <span className="ml-2 inline-flex items-center gap-1.5 text-green-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {live} active now
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/analytics/google?days=${d}`}
              className={d === range.days ? "btn-primary text-sm" : "btn-ghost text-sm"}
            >
              {d}d
            </Link>
          ))}
          <Link href="/analytics" className="btn-ghost text-sm ml-2" title="Events collected by our own tracker">
            Our tracker
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-xs font-semibold text-gray-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.hint}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex justify-between items-baseline">
          <div>
            <div className="font-semibold text-gray-900">Sessions per day</div>
            <div className="text-xs text-gray-400">
              Engagement rate {(t.engagementRate * 100).toFixed(1)}% over the period
            </div>
          </div>
        </div>
        {report.daily.length === 0 ? (
          <p className="muted text-sm mt-3">No sessions in this range.</p>
        ) : (
          <div className="mt-4 flex items-end gap-0.5 h-36">
            {report.daily.map((d) => (
              <div
                key={d.date}
                className="flex-1 bg-brand-500 rounded-t hover:bg-brand-600 transition-colors min-h-[2px]"
                style={{ height: `${(d.sessions / maxDay) * 100}%` }}
                title={`${d.date} — ${d.sessions} sessions, ${d.users} users, ${d.pageViews} views`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Breakdown title="Channels" hint="How people arrived" rows={report.channels} />
        <Breakdown title="Sources" hint="Referring site or platform" rows={report.sources} />
        <Breakdown title="Campaigns" hint="Tagged campaign traffic" rows={report.campaigns} />
        <Breakdown title="Devices" hint="Sessions by device type" rows={report.devices} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-semibold text-gray-900">Top pages</div>
          <div className="text-xs text-gray-400 mb-3">Most-viewed pages</div>
          {report.pages.length === 0 ? (
            <p className="muted text-sm">No page views in this range.</p>
          ) : (
            <div className="space-y-2.5">
              {report.pages.map((p) => (
                <div key={p.path}>
                  <div className="flex justify-between text-sm gap-3">
                    <span className="truncate text-gray-700" title={p.title || p.path}>{p.path}</span>
                    <span className="font-semibold text-gray-900 shrink-0">
                      {p.views.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar value={p.views} max={maxPage} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Breakdown title="Countries" hint="Where sessions came from" rows={report.countries} />
      </div>

      <p className="muted text-xs">
        Figures are Google&rsquo;s own and will not match the{" "}
        <Link href="/analytics" className="underline">Website Analytics</Link> page: ad-blockers
        stop Google&rsquo;s tag more often than ours, and GA applies its own sampling and
        thresholds. Where a number matters commercially, the CRM lead count is the one to trust.
      </p>
    </div>
  );
}
