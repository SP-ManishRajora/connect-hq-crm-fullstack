import Link from "next/link";

// Temporary scaffold for the Housekeeping module. Each page is nav-reachable and
// role-guarded today; the real screens land phase by phase per
// docs/housekeeping-module.md. Delete this component once every page is built.
export default function Placeholder({
  icon,
  title,
  phase,
  summary,
  items,
}: {
  icon: string;
  title: string;
  phase: string;
  summary: string;
  items: string[];
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">{icon}</span>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <div className="text-sm text-gray-500 mb-6">{summary}</div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6">
        <div className="text-sm font-medium text-amber-900">Not built yet — {phase}</div>
        <div className="text-sm text-amber-800 mt-1">
          The screen is scaffolded so the menu and permissions can be tested. See the{" "}
          <span className="font-mono text-xs">docs/housekeeping-module.md</span> checklist
          for the build order.
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Planned on this screen
        </div>
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-gray-300">☐</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <Link href="/housekeeping" className="text-sm text-brand-600 hover:underline">
          ← Housekeeping dashboard
        </Link>
      </div>
    </div>
  );
}
