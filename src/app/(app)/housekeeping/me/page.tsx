import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeEfficiency } from "@/lib/housekeeping/efficiency";

export const dynamic = "force-dynamic";

// Supervisor personal compliance (item 8.7). Deliberately about the individual's
// own work only — rounds run, areas covered, flags raised against them, and the
// corrective actions they still owe. Cross-centre comparison lives on the
// management dashboard; this page is for the person doing the walking.

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export default async function MyPerformancePage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_inspect", me.allowedModules))) redirect("/dashboard");

  const from = new Date(Date.now() - 30 * 86400_000);

  const [rounds, visits, myIssues, awaitingMe, efficiency] = await Promise.all([
    prisma.inspectionRound.findMany({
      where: { userId: me.id, startedAt: { gte: from } },
      orderBy: { startedAt: "desc" },
      include: { center: { select: { name: true } }, _count: { select: { visits: true } } },
    }),
    prisma.inspectionVisit.findMany({
      where: { userId: me.id, scannedAt: { gte: from } },
      select: { status: true, flags: true, dwellSeconds: true, geofenceOk: true },
    }),
    prisma.hkIssue.findMany({
      where: { assigneeId: me.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: [{ severity: "asc" }, { dueAt: "asc" }],
      include: { location: { select: { name: true } } },
    }),
    // Work I submitted that a colleague still has to verify.
    prisma.hkIssue.count({
      where: { assigneeId: me.id, status: "AWAITING_VERIFICATION" },
    }),
    computeEfficiency(me.id, from, new Date()),
  ]);

  const submitted = visits.filter((v) => v.status === "SUBMITTED").length;
  const flagged = visits.filter((v) => v.flags && v.flags !== "[]").length;
  const overdue = myIssues.filter((i) => i.dueAt && i.dueAt < new Date()).length;

  // Which flags were raised against this person's scans, and how often.
  const flagCounts = new Map<string, number>();
  for (const v of visits) {
    try {
      for (const f of JSON.parse(v.flags ?? "[]") as string[]) {
        flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
      }
    } catch { /* a malformed flags blob must not break the page */ }
  }
  const topFlags = [...flagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">📊 My Performance</h1>
      <p className="text-sm text-gray-500 mb-5">
        Your own inspection and corrective-action record over the last 30 days.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Tile label="Rounds" value={String(rounds.length)} />
        <Tile label="Areas submitted" value={String(submitted)} />
        <Tile label="Clean scans" value={`${pct(visits.length - flagged, visits.length)}%`}
          cls={flagged === 0 ? "text-emerald-600" : pct(visits.length - flagged, visits.length) >= 80 ? "text-amber-600" : "text-rose-600"} />
        <Tile label="Efficiency" value={efficiency.sampleSize > 0 ? String(efficiency.score) : "—"}
          cls={efficiency.score >= 80 ? "text-emerald-600" : efficiency.score >= 60 ? "text-amber-600" : "text-rose-600"} />
      </div>

      {myIssues.length > 0 && (
        <section className="rounded-xl border bg-white p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-sm">
              Assigned to you — {myIssues.length}
              {overdue > 0 && <span className="text-rose-600"> ({overdue} overdue)</span>}
            </h2>
            <Link href="/housekeeping/tasks" className="text-xs text-brand-600 hover:underline">
              Open My Tasks
            </Link>
          </div>
          <div className="space-y-1.5">
            {myIssues.slice(0, 6).map((i) => {
              const late = i.dueAt && i.dueAt < new Date();
              return (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    i.severity === "CRITICAL" ? "bg-rose-100 text-rose-800"
                    : i.severity === "HIGH" ? "bg-orange-100 text-orange-800"
                    : "bg-amber-100 text-amber-800"}`}>
                    {i.severity}
                  </span>
                  <span className="flex-1 truncate">{i.title}</span>
                  <span className="text-xs text-gray-500">{i.location?.name ?? "—"}</span>
                  {late && <span className="text-xs text-rose-600 font-medium">overdue</span>}
                </div>
              );
            })}
          </div>
          {awaitingMe > 0 && (
            <p className="mt-3 text-xs text-violet-800 bg-violet-50 rounded p-2">
              {awaitingMe} item{awaitingMe === 1 ? "" : "s"} you submitted are waiting for a
              colleague to verify — you cannot sign off your own work.
            </p>
          )}
        </section>
      )}

      {topFlags.length > 0 && (
        <section className="rounded-xl border bg-white p-4 mb-5">
          <h2 className="font-medium text-sm mb-1">Flags raised on your scans</h2>
          <p className="text-xs text-gray-500 mb-3">
            Flags are prompts to check something, not accusations.
          </p>
          <div className="space-y-1.5">
            {topFlags.map(([flag, n]) => (
              <div key={flag} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{FLAG_TEXT[flag] ?? flag}</span>
                <span className="text-xs text-gray-500">{n}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4 mb-5">
        <h2 className="font-medium text-sm mb-1">How your efficiency score is made up</h2>
        <p className="text-xs text-gray-500 mb-3">
          Based on how work was handled — never on how many issues were reported.
        </p>
        <div className="space-y-2">
          {efficiency.factors.map((f) => (
            <div key={f.key} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1">{f.label}</span>
                <span className="text-xs text-gray-500">{Math.round(f.weight * 100)}%</span>
                <span className={`w-10 text-right font-medium ${
                  !f.measurable ? "text-gray-300"
                  : f.score >= 80 ? "text-emerald-600"
                  : f.score >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                  {f.measurable ? Math.round(f.score) : "—"}
                </span>
              </div>
              <div className="text-[11px] text-gray-400">{f.detail}</div>
            </div>
          ))}
        </div>
        {efficiency.reasons.length > 0 && (
          <div className="mt-3 rounded bg-amber-50 p-2.5 text-xs text-amber-900">
            {efficiency.reasons.map((r) => <div key={r}>• {r}</div>)}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-medium text-sm">Recent rounds</h2>
        </div>
        <div className="divide-y">
          {rounds.slice(0, 10).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">{r.center.name}</span>
              <span className="text-xs text-gray-500">{r._count.visits} areas</span>
              <span className="text-xs text-gray-500">
                {new Date(r.startedAt).toLocaleDateString()}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {r.status === "COMPLETED" ? "completed" : "in progress"}
              </span>
            </div>
          ))}
          {rounds.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              No rounds in the last 30 days.{" "}
              <Link href="/housekeeping/inspect" className="text-brand-600 hover:underline">
                Start one
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const FLAG_TEXT: Record<string, string> = {
  GEOFENCE_FAIL: "Scanned outside the permitted radius",
  GEOFENCE_UNVERIFIED: "Area had no saved GPS point",
  NO_GPS: "No GPS position available",
  POOR_GPS_ACCURACY: "Poor GPS accuracy",
  TOO_FAST: "Completed faster than the minimum time",
  IMPOSSIBLE_MOVEMENT: "Implausible travel speed between areas",
  RAPID_RESCAN: "Scans very close together",
  DEVICE_SWITCH: "Changed device mid-round",
  DUPLICATE_PHOTO: "Duplicate photograph",
  GALLERY_UPLOAD: "Gallery upload rather than camera",
  PHOTO_TIME_MISMATCH: "Photo time differed from server time",
};

function Tile({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
