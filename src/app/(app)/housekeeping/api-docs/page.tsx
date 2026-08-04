import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ROUTES, OPENAPI_VERSION } from "@/lib/housekeeping/openapi";

export const dynamic = "force-dynamic";

// Browsable API reference (Phase 11.7).
//
// Rendered server-side from the same table that generates the OpenAPI document,
// so the two can never disagree. No Swagger-UI bundle: a strict CSP would block
// its CDN assets, and shipping ~1 MB of JavaScript to render a table nobody
// interacts with would be a poor trade.
const METHOD_CLS: Record<string, string> = {
  get: "bg-sky-100 text-sky-800",
  post: "bg-emerald-100 text-emerald-800",
  patch: "bg-amber-100 text-amber-800",
  delete: "bg-rose-100 text-rose-800",
};

export default async function ApiDocsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "housekeeping", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const modules = [...new Set(ROUTES.map((r) => r.module))];
  const publicCount = ROUTES.filter((r) => r.auth === "none").length;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">📘 Housekeeping API</h1>
      <p className="text-sm text-gray-500 mb-4">
        {ROUTES.length} endpoints across {modules.length} modules · spec v{OPENAPI_VERSION} ·{" "}
        <a href="/api/housekeeping/openapi" className="text-brand-600 hover:underline" target="_blank" rel="noopener">
          download OpenAPI JSON
        </a>
      </p>

      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 mb-6">
        <strong>{publicCount} endpoints are public and unauthenticated</strong> — the client
        cleaning-request routes. They are rate limited per IP and per QR code, and the QR code is
        the only way a caller can name a centre or area. Everything else requires a session
        <em> and </em> a module key.
      </div>

      {modules.map((m) => (
        <section key={m} className="mb-6">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-500 mb-2">{m}</h2>
          <div className="space-y-2">
            {ROUTES.filter((r) => r.module === m).map((r, i) => (
              <div key={`${r.path}-${r.method}-${i}`} className="rounded-lg border bg-white p-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${METHOD_CLS[r.method]}`}>
                    {r.method}
                  </span>
                  <code className="text-xs font-mono text-gray-700 break-all">{r.path}</code>
                  {r.auth === "none" && (
                    <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] text-white">PUBLIC</span>
                  )}
                  {r.auth === "cron" && (
                    <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-white">CRON</span>
                  )}
                  {r.scope && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                      {r.scope}
                    </span>
                  )}
                </div>
                <div className="text-sm mt-1.5">{r.summary}</div>

                {(r.body || r.query) && (
                  <div className="mt-2 text-xs text-gray-500">
                    {r.query && (
                      <div>
                        <span className="font-medium">Query:</span>{" "}
                        {Object.entries(r.query).map(([k, v]) => `${k} (${v})`).join(", ")}
                      </div>
                    )}
                    {r.body && (
                      <div>
                        <span className="font-medium">Body:</span>{" "}
                        {Object.entries(r.body).map(([k, v]) => `${k}: ${v}`).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(r.responses).map(([code, desc]) => (
                    <div key={code} className="text-xs">
                      <span className={`font-mono font-medium ${
                        code.startsWith("2") ? "text-emerald-700" : "text-rose-700"}`}>
                        {code}
                      </span>{" "}
                      <span className="text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
