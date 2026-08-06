// OpenAPI 3.1 description of the housekeeping API (Phase 11.7).
//
// Hand-authored rather than generated: the routes use plain Next handlers with
// Zod validation inside, so there is no decorator metadata to introspect. A
// hand-written spec risks drifting from the code, so `npm run hk:openapi:check`
// diffs the documented paths against the route files on disk and fails if they
// disagree — the spec cannot silently rot.

export const OPENAPI_VERSION = "1.0.0";

type Method = "get" | "post" | "patch" | "delete";

const AUTH = {
  session: "Session cookie (`erp_session`). Enforced by middleware.",
  cron: "`x-cron-secret` header matching `HK_CRON_SECRET`, or an authenticated manager.",
  none: "**Public — no authentication.** Rate limited per IP and per QR code.",
} as const;

type RouteDoc = {
  path: string;
  method: Method;
  module: string;
  summary: string;
  auth: keyof typeof AUTH;
  scope?: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
  responses: Record<string, string>;
};

// One entry per route file. `module` groups them in the UI.
export const ROUTES: RouteDoc[] = [
  // ---- locations & QR ----
  { path: "/api/housekeeping/locations", method: "get", module: "Locations", auth: "session", scope: "housekeeping",
    summary: "List inspection areas for a centre",
    query: { centerId: "string", includeInactive: "0|1" },
    responses: { "200": "InspectionLocation[] with active QR code", "403": "no module access" } },
  { path: "/api/housekeeping/locations", method: "post", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Create an inspection area",
    body: { centerId: "string", name: "string", category: "enum", geofenceRadiusM: "int (default 50)" },
    responses: { "201": "created", "400": "validation failed" } },
  { path: "/api/housekeeping/locations/{id}", method: "patch", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Update an area (name, GPS, geofence, angles, checklist)",
    responses: { "200": "updated; before→after written to the audit log" } },
  { path: "/api/housekeeping/locations/{id}", method: "delete", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Soft-delete an area and retire its QR codes",
    responses: { "200": "deletedAt set; inspection history preserved" } },
  { path: "/api/housekeeping/locations/{id}/qr", method: "post", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Mint or rotate the staff QR code",
    responses: { "201": "new code; the previous one is deactivated, not mutated" } },
  { path: "/api/housekeeping/locations/{id}/client-qr", method: "post", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Mint or rotate the client QR code (the other half of the area's single sticker)",
    responses: { "201": "new code; the previous one is deactivated, not mutated" } },
  { path: "/api/housekeeping/locations/reorder", method: "post", module: "Locations", auth: "session", scope: "hk_admin",
    summary: "Persist the inspection route order",
    body: { centerId: "string", orderedIds: "string[]" },
    responses: { "200": "{ ok, updated }" } },

  // ---- verified client reviews ----
  { path: "/api/housekeeping/reviews/request-otp", method: "post", module: "Reviews", auth: "none", scope: "-",
    summary: "Send a one-time passcode to a mobile or email for review verification",
    body: { code: "string", destination: "string", channel: "SMS|EMAIL" },
    responses: { "200": "{ otpId, destination, delivered, expiresInMinutes }", "429": "rate limited per destination and IP" } },
  { path: "/api/housekeeping/reviews/verify-otp", method: "post", module: "Reviews", auth: "none", scope: "-",
    summary: "Check a passcode; consumes it and authorises one review",
    body: { destination: "string", code: "string", channel: "SMS|EMAIL" },
    responses: { "200": "{ otpId, destination, validForMinutes }", "400": "incorrect or expired" } },
  { path: "/api/housekeeping/reviews/public", method: "post", module: "Reviews", auth: "none", scope: "-",
    summary: "Post a review using a verified passcode (company is self-declared)",
    body: { code: "string", otpId: "string", destination: "string", rating: "1-5", comment: "string?", clientId: "string?" },
    responses: { "201": "{ id, rating, area }", "401": "verification missing or expired", "409": "this passcode already posted a review" } },
  { path: "/api/housekeeping/reviews/{id}", method: "delete", module: "Reviews", auth: "session", scope: "housekeeping",
    summary: "Hide a review (soft; manager only, row is retained)",
    responses: { "200": "{ id, status }", "403": "not a manager" } },

  // ---- inspection ----
  { path: "/api/housekeeping/rounds", method: "get", module: "Inspection", auth: "session", scope: "housekeeping",
    summary: "List inspection rounds", query: { mine: "0|1", status: "enum" },
    responses: { "200": "InspectionRound[]" } },
  { path: "/api/housekeeping/rounds", method: "post", module: "Inspection", auth: "session", scope: "hk_inspect",
    summary: "Start a round (resumes an open one rather than forking)",
    body: { centerId: "string" }, responses: { "201": "created", "200": "resumed" } },
  { path: "/api/housekeeping/rounds/{id}/complete", method: "post", module: "Inspection", auth: "session", scope: "hk_inspect",
    summary: "Complete a round; computes distance, coverage and score",
    responses: { "200": "{ submitted, totalLocations, missed }" } },
  { path: "/api/housekeeping/visits", method: "post", module: "Inspection", auth: "session", scope: "hk_inspect",
    summary: "Scan an area QR — server-time stamped, geofence and device verified",
    body: { roundId: "string", code: "string", lat: "number?", lng: "number?", deviceId: "string?" },
    responses: {
      "200": "{ visit, location, requiredAngles, flags, distanceM }",
      "403": "device revoked", "410": "QR retired", "422": "outside geofence (when rejection is enabled)",
    } },
  { path: "/api/housekeeping/visits/{id}/submit", method: "post", module: "Inspection", auth: "session", scope: "hk_inspect",
    summary: "Submit an area; enforces the distinct-slot photo count and dwell time",
    responses: { "200": "{ tooFast, dwellSeconds }", "400": "fewer photographs than required" } },
  { path: "/api/housekeeping/photos", method: "post", module: "Inspection", auth: "session", scope: "hk_inspect",
    summary: "Upload an inspection photograph (multipart)",
    body: { file: "binary", visitId: "string", slot: "int", pHash: "string?" },
    responses: { "201": "{ id, flags, duplicate }", "403": "device revoked", "415": "not an image (magic-byte check)" } },
  { path: "/api/housekeeping/photos/{id}/file", method: "get", module: "Inspection", auth: "session", scope: "housekeeping",
    summary: "Fetch a photograph via a signed URL",
    query: { exp: "unix seconds", sig: "HMAC" },
    responses: { "200": "image bytes", "403": "bad or expired signature", "410": "purged under the retention policy" } },

  // ---- issues ----
  { path: "/api/housekeeping/issues", method: "get", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "List issues", query: { open: "0|1", mine: "0|1", overdue: "0|1", severity: "enum" },
    responses: { "200": "HkIssue[] with signed before/after URLs" } },
  { path: "/api/housekeeping/issues", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Raise an issue; hazards are auto-escalated to CRITICAL",
    body: { centerId: "string", category: "enum", title: "string", severity: "enum" },
    responses: { "201": "{ ...issue, autoEscalated }" } },
  { path: "/api/housekeeping/issues/{id}/assign", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Assign or re-triage (a severity change resets the SLA clock)",
    responses: { "200": "updated", "409": "illegal state transition" } },
  { path: "/api/housekeeping/issues/{id}/start", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Mark work started; opens a CorrectiveAction attempt",
    responses: { "200": "updated", "403": "not the assignee" } },
  { path: "/api/housekeeping/issues/{id}/photo", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Upload the after-cleaning photograph (multipart)",
    responses: { "201": "{ id, duplicate }", "409": "work not started" } },
  { path: "/api/housekeeping/issues/{id}/complete", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Submit completed work, or report unable-to-complete",
    responses: { "200": "awaiting verification", "400": "after-photograph required" } },
  { path: "/api/housekeeping/issues/{id}/verify", method: "post", module: "Issues", auth: "session", scope: "hk_issues",
    summary: "Verify (PASS→CLOSED) or reject (FAIL→REJECTED)",
    body: { verdict: "PASS|FAIL" },
    responses: { "200": "{ ...issue, reinspection }", "403": "cannot verify your own work" } },

  // ---- generator ----
  { path: "/api/housekeeping/generators", method: "get", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "List generators with live running state",
    responses: { "200": "Generator[] with running, runningSince, lastReading" } },
  { path: "/api/housekeeping/generators", method: "post", module: "Generator", auth: "session", scope: "hk_admin",
    summary: "Add a generator", responses: { "201": "created", "409": "duplicate code at this centre" } },
  { path: "/api/housekeeping/generators/{id}/on", method: "post", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Switch ON — server time, mandatory panel + tank photographs (multipart)",
    responses: { "201": "{ event, reading, discrepancies }", "409": "already running" } },
  { path: "/api/housekeeping/generators/{id}/off", method: "post", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Switch OFF — computes duration, fuel used and L/h (multipart)",
    responses: { "200": "{ summary, discrepancies }", "409": "not running" } },
  { path: "/api/housekeeping/generators/{id}/readings", method: "get", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Chronological reading ledger", responses: { "200": "GeneratorReading[]" } },
  { path: "/api/housekeeping/generators/{id}/readings", method: "post", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Periodic reading while running (multipart)", responses: { "201": "{ reading, discrepancies }" } },
  { path: "/api/housekeeping/generators/{id}/refills", method: "get", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Refill history and consumption trend", responses: { "200": "{ refills, trend, totals }" } },
  { path: "/api/housekeeping/generators/{id}/refills", method: "post", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Log a diesel refill", responses: { "201": "created", "400": "exceeds tank capacity" } },
  { path: "/api/housekeeping/generators/discrepancies", method: "get", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "List discrepancies", query: { open: "0|1" }, responses: { "200": "GeneratorDiscrepancy[]" } },
  { path: "/api/housekeeping/generators/discrepancies/{id}/resolve", method: "post", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Resolve a discrepancy, optionally raising an issue",
    responses: { "200": "stamped, never deleted", "409": "already resolved" } },
  { path: "/api/housekeeping/generators/photos/{id}/file", method: "get", module: "Generator", auth: "session", scope: "hk_generator",
    summary: "Fetch a generator photograph via a signed URL",
    responses: { "200": "image bytes", "410": "purged under the retention policy" } },

  // ---- alerts & reports ----
  { path: "/api/housekeeping/alerts", method: "get", module: "Alerts", auth: "session", scope: "housekeeping",
    summary: "List alerts; also the polling endpoint for live updates",
    query: { since: "ISO timestamp", status: "enum" },
    responses: { "200": "HkAlert[] with delivery status" } },
  { path: "/api/housekeeping/alerts/{id}/ack", method: "post", module: "Alerts", auth: "session", scope: "housekeeping",
    summary: "Acknowledge an alert", responses: { "200": "acknowledged", "409": "already acknowledged" } },
  { path: "/api/housekeeping/email-groups", method: "get", module: "Alerts", auth: "session", scope: "hk_admin",
    summary: "List recipient groups", responses: { "200": "EmailGroup[]" } },
  { path: "/api/housekeeping/email-groups", method: "post", module: "Alerts", auth: "session", scope: "hk_admin",
    summary: "Create a recipient group (TO + CC, optional centre scope)",
    responses: { "201": "created", "400": "invalid email address" } },
  { path: "/api/housekeeping/reports", method: "get", module: "Reports", auth: "session", scope: "hk_reports",
    summary: "Run a report, or list the menu when `type` is omitted",
    query: { type: "one of 18", format: "json|csv|xlsx|pdf", centerId: "string", from: "date", to: "date" },
    responses: { "200": "ReportTable, CSV, XLSX or printable HTML", "400": "unknown report type" } },

  // ---- cleaning requests ----
  { path: "/api/housekeeping/requests/public", method: "post", module: "Cleaning requests", auth: "none",
    summary: "Client raises a request from an area QR",
    body: { code: "string (client QR)", typeId: "string", clientId: "string?", description: "string?" },
    responses: {
      "201": "{ ticketNo, statusToken, etaMinutes } — no internal ids",
      "400": "unknown company or missing type", "404": "unknown QR", "429": "rate limited",
    } },
  { path: "/api/housekeeping/requests/resolve/{code}", method: "get", module: "Cleaning requests", auth: "none",
    summary: "Resolve a client QR into area, catalogue and company list",
    responses: { "200": "{ area, centre, types, clients }", "404": "unknown code", "429": "rate limited" } },
  { path: "/api/housekeeping/requests/status/{token}", method: "get", module: "Cleaning requests", auth: "none",
    summary: "Client status view (token-scoped, minimal payload)",
    responses: { "200": "{ ticketNo, statusLabel, progress }", "404": "unknown token" } },
  { path: "/api/housekeeping/requests/status/{token}", method: "post", module: "Cleaning requests", auth: "none",
    summary: "Client confirmation and 1–5 rating; NOT_COMPLETED reopens",
    body: { confirmation: "SATISFACTORY|PARTIAL|NOT_COMPLETED", rating: "1-5?" },
    responses: { "200": "{ ok, status }", "409": "not awaiting confirmation" } },
  { path: "/api/housekeeping/requests", method: "get", module: "Cleaning requests", auth: "session", scope: "hk_requests",
    summary: "Staff request queue", query: { open: "0|1", mine: "0|1", complaints: "0|1" },
    responses: { "200": "CleaningRequest[]" } },
  { path: "/api/housekeeping/requests/{id}/action", method: "post", module: "Cleaning requests", auth: "session", scope: "hk_requests",
    summary: "Progress a request; COMPLETE validates the re-scanned area QR",
    body: { action: "ASSIGN|ACCEPT|ON_THE_WAY|START|COMPLETE|UNABLE|CANCEL", qrCode: "string?" },
    responses: { "200": "updated", "400": "wrong-area QR or no photograph", "409": "illegal transition" } },
  { path: "/api/housekeeping/requests/{id}/photo", method: "post", module: "Cleaning requests", auth: "session", scope: "hk_requests",
    summary: "Upload after-cleaning evidence (multipart)",
    responses: { "201": "{ id, duplicate }" } },

  // ---- AI analysis ----
  { path: "/api/housekeeping/ai/health", method: "get", module: "AI analysis", auth: "session", scope: "housekeeping",
    summary: "Driver reachability and analysis queue depth",
    responses: { "200": "{ driver, ok, detail, stub, queue: { pending, running, failed, done } }" } },
  { path: "/api/housekeeping/ai/findings", method: "get", module: "AI analysis", auth: "session", scope: "housekeeping",
    summary: "Findings for a visit, plus how many photographs are still queued",
    query: { visitId: "string (required)" },
    responses: { "200": "{ findings, pending, total, stub, summary }", "400": "visitId missing" } },
  { path: "/api/housekeeping/ai/findings/{id}", method: "patch", module: "AI analysis", auth: "session", scope: "hk_inspect",
    summary: "Record a verdict: accept, correct, or mark not applicable",
    body: { verdict: "ACCEPTED|CORRECTED|NOT_APPLICABLE", correctedIssue: "string?", correctedSeverity: "enum?" },
    responses: {
      "200": "updated; the original model output is preserved alongside the correction",
      "400": "CORRECTED with nothing corrected",
    } },
  { path: "/api/housekeeping/ai/findings/{id}", method: "post", module: "AI analysis", auth: "session", scope: "hk_inspect",
    summary: "Record an issue the model missed (id is ignored; colocated for one base path)",
    body: { visitId: "string", photoId: "string", category: "enum", issue: "string", severity: "enum" },
    responses: { "201": "created with verdict ADDED and confidence 1" } },
  { path: "/api/housekeeping/cron/ai", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Drain the analysis queue; retries transient failures with backoff",
    query: { limit: "int" },
    responses: { "200": "{ claimed, done, failed, skipped, driver, stub }" } },

  // ---- settings ----
  { path: "/api/housekeeping/settings", method: "get", module: "Settings", auth: "session", scope: "hk_admin",
    summary: "Every tunable in one document, plus the read-only driver selection",
    responses: { "200": "{ inspection, issues, generator, requests, efficiency, retention, ai, aiDriver, ocrDriver }" } },
  { path: "/api/housekeeping/settings", method: "patch", module: "Settings", auth: "session", scope: "hk_admin",
    summary: "Update one config group; before→after is written to the audit log",
    body: { group: "inspection|issues|generator|requests|efficiency|retention|ai", patch: "object" },
    responses: { "200": "the updated group", "400": "unknown group" } },

  // ---- security ----
  { path: "/api/housekeeping/devices", method: "get", module: "Security", auth: "session", scope: "hk_admin",
    summary: "List registered inspection devices with scan counts",
    responses: { "200": "DeviceRegistration[]" } },
  { path: "/api/housekeeping/devices/{id}/revoke", method: "post", module: "Security", auth: "session", scope: "hk_admin",
    summary: "Revoke a device (blocks scan + upload) or restore it",
    body: { restore: "boolean", reason: "string?" },
    responses: { "200": "updated", "409": "already in that state" } },

  // ---- cron ----
  { path: "/api/housekeeping/cron/escalations", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Escalate overdue corrective actions (idempotent)",
    responses: { "200": "{ escalated, notified }" } },
  { path: "/api/housekeeping/cron/generator-checks", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Detect missed periodic photographs and over-long runs",
    responses: { "200": "{ runningGenerators, discrepanciesRaised }" } },
  { path: "/api/housekeeping/cron/request-sla", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Flag SLA breaches and auto-close unconfirmed completions",
    responses: { "200": "{ breached, autoClosed }" } },
  { path: "/api/housekeeping/cron/daily-summary", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Email the management digest", query: { period: "daily|weekly" },
    responses: { "200": "{ centres, sent }" } },
  { path: "/api/housekeeping/cron/retention", method: "post", module: "Scheduled jobs", auth: "cron",
    summary: "Purge photograph files past the retention window",
    query: { dry: "0|1" },
    responses: { "200": "{ purged, mbFreed, moreRemaining }" } },
];

// Builds an OpenAPI 3.1 document from the table above.
export function buildOpenApi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of ROUTES) {
    // {id} → OpenAPI path parameters
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1], in: "path", required: true, schema: { type: "string" },
    }));

    const query = Object.entries(r.query ?? {}).map(([name, desc]) => ({
      name, in: "query", required: false,
      schema: { type: "string" }, description: desc,
    }));

    paths[r.path] ??= {};
    paths[r.path][r.method] = {
      tags: [r.module],
      summary: r.summary,
      description: `**Auth:** ${AUTH[r.auth]}${r.scope ? `\n\n**Module key:** \`${r.scope}\`` : ""}`,
      parameters: [...params, ...query],
      ...(r.body
        ? {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: Object.fromEntries(
                      Object.entries(r.body).map(([k, v]) => [k, { type: "string", description: v }]),
                    ),
                  },
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(r.responses).map(([code, desc]) => [code, { description: desc }]),
      ),
      ...(r.auth === "none" ? { security: [] } : { security: [{ sessionCookie: [] }] }),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Coworking ERP — Housekeeping API",
      version: OPENAPI_VERSION,
      description:
        "QR inspections, corrective actions, generator monitoring, alerts, reports and " +
        "client cleaning requests.\n\n" +
        "Three endpoints under `/requests/` are **public and unauthenticated** — they are " +
        "rate limited per IP and per QR code. Every other route requires a session and a " +
        "module key from the RBAC table.",
    },
    servers: [{ url: origin }],
    tags: [...new Set(ROUTES.map((r) => r.module))].map((m) => ({ name: m })),
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "erp_session" },
        cronSecret: { type: "apiKey", in: "header", name: "x-cron-secret" },
      },
    },
    paths,
  };
}
