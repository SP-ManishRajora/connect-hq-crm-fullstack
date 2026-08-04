import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/housekeeping/storage";
import { centerScope } from "@/lib/housekeeping/route-helpers";

export const dynamic = "force-dynamic";

// Centre drill-down (item 8.6): area list with the latest photograph, last and
// next inspection, open issues and generator status — the operational view a
// centre manager wants, as opposed to the cross-centre management dashboard.

function ago(d: Date | null | undefined): string {
  if (!d) return "never";
  const h = (Date.now() - d.getTime()) / 3600_000;
  if (h < 1) return `${Math.round(h * 60)} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default async function CentrePage({ params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "housekeeping", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  // A centre-scoped user may only open their own centre.
  const scope = centerScope(me);
  if (scope && scope !== params.id) redirect("/housekeeping");

  const centre = await prisma.center.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, city: true },
  });
  if (!centre) notFound();

  const [locations, generators, openIssues] = await Promise.all([
    prisma.inspectionLocation.findMany({
      where: { centerId: centre.id, deletedAt: null, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        visits: {
          where: { status: "SUBMITTED" },
          orderBy: { scannedAt: "desc" },
          take: 1,
          include: {
            user: { select: { name: true } },
            areaSummary: true,
            photos: { orderBy: { slot: "asc" }, take: 1, select: { id: true, purgedAt: true } },
          },
        },
        issues: {
          where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
          select: { id: true, severity: true },
        },
      },
    }),
    prisma.generator.findMany({
      where: { centerId: centre.id, deletedAt: null, active: true },
      include: {
        events: { orderBy: { atServer: "desc" }, take: 1, select: { type: true, atServer: true } },
        readings: { orderBy: { at: "desc" }, take: 1, select: { fuelReading: true, at: true } },
        _count: { select: { discrepancies: { where: { resolvedAt: null } } } },
      },
    }),
    prisma.hkIssue.count({
      where: { centerId: centre.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
    }),
  ]);

  const inspectedToday = locations.filter((l) => {
    const v = l.visits[0];
    return v && v.scannedAt > new Date(new Date().setHours(0, 0, 0, 0));
  }).length;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-2xl font-semibold">🏢 {centre.name}</h1>
          <p className="text-sm text-gray-500">{centre.city}</p>
        </div>
        <Link href="/housekeeping" className="text-sm text-brand-600 hover:underline">
          ← All centres
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
        <Tile label="Areas" value={String(locations.length)} />
        <Tile label="Inspected today" value={`${inspectedToday}/${locations.length}`}
          cls={inspectedToday === 0 ? "text-rose-600" : inspectedToday < locations.length ? "text-amber-600" : "text-emerald-600"} />
        <Tile label="Open issues" value={String(openIssues)} cls={openIssues > 0 ? "text-amber-600" : ""} />
        <Tile label="Generators running"
          value={String(generators.filter((g) => g.events[0]?.type === "ON").length)} />
      </div>

      {generators.length > 0 && (
        <section className="rounded-xl border bg-white p-4 mb-5">
          <h2 className="font-medium text-sm mb-3">Generators</h2>
          <div className="space-y-2">
            {generators.map((g) => {
              const running = g.events[0]?.type === "ON";
              return (
                <div key={g.id} className="flex items-center gap-3 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-gray-500">{g.code}</span>
                  <span className="text-xs text-gray-500">
                    {running ? `running since ${ago(g.events[0].atServer)}` : "off"}
                    {g.readings[0]?.fuelReading != null && ` · ${g.readings[0].fuelReading} L`}
                  </span>
                  {g._count.discrepancies > 0 && (
                    <span className="ml-auto rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-800">
                      {g._count.discrepancies} discrepanc{g._count.discrepancies === 1 ? "y" : "ies"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-medium text-sm">Areas</h2>
          <p className="text-xs text-gray-500">Latest photograph, last inspection and open issues.</p>
        </div>
        <div className="divide-y">
          {locations.map((l) => {
            const v = l.visits[0];
            const photo = v?.photos[0];
            const critical = l.issues.filter((i) => i.severity === "CRITICAL").length;
            const summary = v?.areaSummary;
            // Next due = last inspection + (24h / frequency per day).
            const nextDue = v && l.frequencyPerDay > 0
              ? new Date(v.scannedAt.getTime() + (24 / l.frequencyPerDay) * 3600_000)
              : null;
            const overdue = nextDue ? nextDue < new Date() : true;

            return (
              <div key={l.id} className="flex items-start gap-3 p-3">
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {photo && !photo.purgedAt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(photo.id)} alt={l.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-gray-400 text-center px-1">
                      {photo?.purgedAt ? "purged" : "no photo"}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{l.name}</span>
                    <span className="text-[10px] text-gray-400">{l.category.replace(/_/g, " ")}</span>
                    {summary?.overallScore != null && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        summary.overallScore >= 75 ? "bg-emerald-100 text-emerald-800"
                        : summary.overallScore >= 55 ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"}`}>
                        {Math.round(summary.overallScore)}
                      </span>
                    )}
                    {l.lat == null && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">no GPS</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {v ? `Inspected ${ago(v.scannedAt)} by ${v.user.name}` : "Never inspected"}
                    {nextDue && (
                      <span className={overdue ? " text-rose-600 font-medium" : ""}>
                        {" · "}{overdue ? "due now" : `next ${ago(nextDue).replace(" ago", " overdue")}`}
                      </span>
                    )}
                  </div>
                  {l.issues.length > 0 && (
                    <div className="text-xs mt-0.5">
                      <span className={critical > 0 ? "text-rose-600 font-medium" : "text-amber-700"}>
                        {l.issues.length} open issue{l.issues.length === 1 ? "" : "s"}
                        {critical > 0 && ` (${critical} critical)`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {locations.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              No inspection areas configured for this centre.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
