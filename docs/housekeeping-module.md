# Housekeeping, Inspection & Generator Monitoring Module

Status: **Phases 1, 3, 4, 6, 7, 8, 9 shipped** (2026-08-03) — the inspection flow works end to end
(QR scan → GPS/server-time/device verification → 4 live photographs → duplicate detection →
submit → round summary), and issues raised from it now run a full corrective-action loop
(assign → start → after-photo → verify → close, with SLA escalation). AI analysis (Phase 5),
Generator monitoring runs ON/OFF events on server time with mandatory photographs, a
chronological fuel ledger and all 12 discrepancy rules. Alerts, dashboards, staff scoring and all 18 reports (with CSV/Excel/PDF export) are live.
Clients can raise cleaning requests from their own QR codes with no login, and staff run them
to completion with QR-verified presence. **AI analysis (Phase 5) is the only unbuilt phase.**
This document is the development checklist and the source of truth across sessions.
Requirement source: [houskeepingFeacture.md](./houskeepingFeacture.md) (raw client brief).

> **Anything skipped inside a "done" phase is tracked in
> [housekeeping-deferred.md](./housekeeping-deferred.md)** — deferrals, blocked items and open
> business decisions. Add a row there whenever a phase is closed with a gap; work that ledger
> to empty after Phase 10.

## What works today

| Screen | State |
|---|---|
| `/housekeeping/setup` | **Live** — add/pause/remove areas, capture GPS per area, rotate QR |
| `/housekeeping/setup/qr-sheet` | **Live** — printable A4 QR sheet (inline SVG) |
| `/housekeeping/inspect` | **Live** — start round, scan, 4 guided photos, submit, complete |
| `/housekeeping/scan/[code]` | **Live** — landing page when a QR is opened with the phone camera |
| `/housekeeping` (dashboard) | **Live** — facility score, centre rollup, alerts, trend, staff ranking |
| `/housekeeping/issues` | **Live** — raise, assign, triage, verify/reject, before-after evidence |
| `/housekeeping/tasks` | **Live** — assignee view: start, after-photo, submit, unable-to-complete |
| `/housekeeping/requests` | **Live** — staff console: assign, progress, QR-verified completion |
| `/qr/a/[code]` (public) | **Live** — client request screen, no login |
| `/qr/status/[token]` (public) | **Live** — client status tracking + confirmation |
| `/housekeeping/generator` | **Live** — ON/OFF, periodic readings, refills, discrepancy triage |
| `/housekeeping/reports` | **Live** — all 18 reports, CSV / Excel / PDF export |
| `/housekeeping/alerts` | **Live** — alert feed with delivery status, polling, acknowledge |

Seed the standard area set (8 bathrooms, 5 common areas, parking, front, back, guard
room, electricity room, generator area, fuel tank) for every active centre with:

```bash
npm run db:seed:hk      # idempotent — safe to re-run
```

Then open `/housekeeping/setup`, stand in each area and tap **Set GPS** to enable
geofencing (until then scans are recorded but flagged `GEOFENCE_UNVERIFIED`).

---

## 1. Goal

A mobile-first (PWA) QR-based inspection system layered onto the existing ERP:
supervisors and community managers scan a QR at each area, prove presence via GPS +
server time + device, capture 4 live photos, get AI vision findings, and the system
raises issues, corrective actions, generator discrepancies, alerts and management
reports. Clients scanning the same QR get a public "Request Cleaning / Report a
Problem" screen.

## 2. Key decisions (fitted to THIS codebase — not a greenfield)

The brief is written as a standalone greenfield product ("choose Laravel / NestJS /
FastAPI", "build a separate AI microservice", "38 new tables"). This repo is already a
**Next.js 14 App Router + Prisma + MySQL** app with 9-role RBAC, `Center`/`Floor`/`Zone`,
`AuditLog` + `logAction()`, an upload endpoint, `sendMail()`, an OCR stub, and a public
`/qr/[centerId]` page. The module **extends** these rather than introducing a second stack.

| Topic | Decision | Why |
|---|---|---|
| Backend stack | **Stay on Next.js route handlers** — no Laravel/NestJS/FastAPI | The brief says "choose one"; the repo already chose. A second backend doubles deploy/auth surface |
| AI service | **Provider-abstraction lib `src/lib/housekeeping/ai/`** with `ollama` \| `openai-compatible` \| `stub` drivers, selected by env | Satisfies "model abstraction layer" + "local model" without operating a separate microservice. A real microservice stays a drop-in driver |
| AI failure | **Never blocks a submission.** Photos save first; analysis is a queued job row (`AiAnalysisJob`) with retries | Brief §6 + acceptance #20 explicitly require this |
| Job queue | **DB-backed job table + a cron-hit `POST /api/housekeeping/cron/*` route** | Repo idiom already (`run-monthly`, `run-reminders`); no Redis/BullMQ in the stack |
| Roles | **Map onto the existing 9 roles**, do *not* add a parallel role system | See §4 — the brief's 7 personas fit the existing roles + new module keys |
| New tables | **~22 models, not 38** — reuse `User`, `Center`, `Floor`, `Zone`, `Client`, `AuditLog`; skip `roles`/`permissions`/`system_settings` tables | Existing RBAC is code-based (`MODULE_ACCESS`); a DB permission system is a separate refactor |
| Areas ↔ Space | **New `InspectionLocation` model, not `Space`** | `Space` is *rentable inventory* (allocations, invoices). A bathroom/guard room is not rentable; overloading `Space` corrupts occupancy maths |
| Issues ↔ Ticket | **New `HkIssue` model**, cross-linked to `Ticket` optionally | `Ticket` has no severity/SLA/assignee/photo/verification lifecycle. Extending it would disturb the live client-ticket flow |
| Image storage | **Private `private-uploads/` + signed URLs** (`src/lib/housekeeping/storage.ts`), behind a driver so MinIO/S3 is a later swap | *Decided at build time:* the generic `/api/upload` writes into `public/uploads/`, which middleware allowlists — evidence photos would be readable by URL guess. Files now live outside `public/` and are served only via an HMAC-signed, role- and centre-checked route |
| QR encoding | **`qrcode` npm package**, rendered to inline SVG server-side | *Added at build time.* Hand-rolling a spec-correct encoder (Reed–Solomon, masking, version selection) risks unscannable printed codes. Small, dependency-light, rendered inline so printing needs no network |
| QR scanning | **Native `BarcodeDetector`** + always-available manual code entry | No library dependency. iOS Safari lacks the API, so manual entry (and the `/housekeeping/scan/[code]` camera-app landing page) is the fallback rather than a dead end |
| Perceptual hash | **Client-side average-hash**, server stores + compares; server-side **sha256 is authoritative** | No image decoder in this stack, and sharp/jimp is heavy for one hash. A tampered client can only forge its own pHash — exact-duplicate detection stays server-computed over the real bytes |
| OCR | **Extend `src/lib/ocr.ts`** with `ocrGeneratorPanel()` alongside the existing invoice/contract stubs | Same abstraction already exists and is already stubbed |
| Offline mode | **Phase 8, IndexedDB + service worker**, deliberately last | Highest complexity, lowest acceptance-criteria weight; everything else must work online first |
| Client QR screen | **New area-level route in Phase 9** — the printed QR currently points at `/housekeeping/scan/<code>` (staff, authenticated) | *Revised at build time:* `/qr/[centerId]` is the existing **centre-level client ticket page**; reusing that path for area codes would collide with a live flow. Phase 9 adds the public area screen and can repoint the same codes without reprinting |

### Scope note (raised, not silently dropped)

The brief's §22 "Required Deliverables" asks for Docker Compose, a separate AI
microservice repo, unit + integration + E2E test suites, and 5 manuals. This repo has
**no test framework and no Docker setup today**. Those items are tracked in Phase 11 as
explicitly optional/deferred rather than assumed — they are a larger platform decision
than this feature. Everything in the brief's §21 **Acceptance Criteria** is covered by
Phases 0–9.

---

## 3. Phase plan (the checklist)

Work top-to-bottom. Each phase is independently shippable and leaves the app green
(`npx tsc --noEmit` clean, existing modules untouched).

### Phase 0 — Foundations & decisions

- [ ] 0.1 Confirm role mapping (§4) and module keys with the user before coding — see **D-01**
- [x] 0.2 Add env vars to `.env.example`: `HK_AI_DRIVER`, `HK_AI_BASE_URL`, `HK_AI_MODEL`,
      `HK_AI_API_KEY`, `HK_AI_TIMEOUT_MS`, `HK_STORAGE_DRIVER`, `HK_UPLOAD_DIR`,
      `HK_SIGNED_URL_SECRET`, `HK_QR_SECRET`, `HK_CRON_SECRET`
- [x] 0.3 Create `src/lib/housekeeping/` skeleton: `types.ts`, `validators.ts`,
      `route-helpers.ts` (copy the proven `src/lib/occupancy/route-helpers.ts` pattern:
      `requireUser`, `parseBody`, `handleError`)
- [ ] 0.4 Decide photo retention default + geofence default radius (propose 50 m) and
      record them in `HkSetting` — see **D-02**, **D-03**

### Phase 1 — Data model

- [x] 1.1 `InspectionLocation` — centerId, floorId?, zoneId?, name, category (enum),
      sortOrder, lat, lng, geofenceRadiusM, requiredPhotoCount (default 4),
      requiredAngles (JSON), minDwellSeconds, frequency, priority, checklist (JSON),
      active, deletedAt
- [x] 1.2 `LocationQrCode` — locationId, code (unique, random ≥16 chars, **no PII in the
      QR**), version, rotatedAt, active. Rotation creates a new row, never mutates
- [x] 1.3 `InspectionRound` — centerId, userId, startedAt, completedAt, status,
      distanceM, score, flags (JSON)
- [x] 1.4 `InspectionVisit` — roundId, locationId, qrCodeId, userId, sequence,
      scannedAt (**server time**), deviceId, lat, lng, gpsAccuracyM, geofenceOk,
      dwellSeconds, submittedAt, status, flags (JSON)
- [x] 1.5 `InspectionPhoto` — visitId, locationId, userId, angle, filePath, thumbPath,
      captureAt (device), serverAt, lat, lng, deviceId, sha256, pHash, qualityScore,
      beforeAfter, retakeReason, source (CAMERA|GALLERY + exception flag)
- [x] 1.6 `GpsLog` — roundId, userId, at, lat, lng, accuracyM (round-scoped only, per
      the brief's privacy constraint)
- [x] 1.7 `DeviceRegistration` — userId, deviceId, fingerprint, label, lastSeenAt, revokedAt
- [ ] 1.8 `AiAnalysisJob` — subjectType, subjectId, status (PENDING|RUNNING|DONE|FAILED),
      attempts, lastError, model, modelVersion, startedAt, finishedAt
- [ ] 1.9 `AiPhotoFinding` — photoId, category, issue, severity, confidence,
      recommendedAction, raw (JSON), userVerdict (ACCEPTED|CORRECTED|ADDED|NOT_APPLICABLE),
      userNote
- [ ] 1.10 `AreaSummary` — visitId, locationId, overallCondition, cleanlinessScore,
       maintenanceScore, safetyScore, consumablesScore, criticalCount, nonCriticalCount,
       reinspectionRequired, newIssues/resolvedIssues/repeatIssues (JSON), trend
- [x] 1.11 `HkIssue` — centerId, locationId, visitId?, source (INSPECTION|CLIENT|MANUAL),
       category, title, description, severity (CRITICAL|HIGH|MEDIUM|LOW), status, dueAt,
       assigneeId, ticketId?, closedById, closedAt
- [x] 1.12 `CorrectiveAction` + `ReinspectionRecord` — issueId, startedAt, completedAt,
       afterPhotoId, verifiedById, verdict, notes
- [ ] 1.13 `HkStaff` + `HkStaffAssignment` + `HkEfficiencyScore` — staff link to `User`,
       shift, centerId, floorId?, areas (JSON); score row per period with
       breakdown (JSON) + manual-override audit fields
- [x] 1.14 `Generator` — centerId, name, code, tankCapacityL, normalLphMin/Max,
       photoIntervalMin (default 30), graceMin, active
- [x] 1.15 `GeneratorEvent` — generatorId, type (ON|OFF), atServer, userId, reason,
       fuelReading, hourMeter, loadReading, comments
- [x] 1.16 `GeneratorReading` — generatorId, centerId, at, userId, status, fuelReading,
       hourMeter, ocrConfidence, userEnteredFuel, userEnteredHours, photoId,
       previousReadingId, fuelDelta, hourDelta, eventId?
- [x] 1.17 `GeneratorPhoto`, `GeneratorRefill` (litres, cost, vendor, invoiceRef, photo),
       `GeneratorDiscrepancy` (ruleCode, severity, expected, actual, delta, resolvedAt)
- [x] 1.18 `HkAlert`, `NotificationLog`, `EmailGroup` (+ `HkEfficiencyScore`). *`AlertRule` /
       `AlertRecipient` not needed: routing is code-driven in `alerts.ts` and recipients resolve
       from `EmailGroup` — a DB rule table would be indirection with no current caller*
- [x] 1.19 `CleaningRequest` + `CleaningRequestEvent` + `CleaningRequestType` +
       `ClientFeedbackEntry` — see Phase 9
- [x] 1.20 `HkSetting` — key/value JSON store for tolerances, weightages, AI prompts,
       retention, SLA targets (avoids a schema change per config knob)
- [x] 1.21 Add relations to `User` and `Center`; add indexes on every `centerId`,
       `locationId`, `generatorId`, `status`, and `(centerId, createdAt)` used by
       dashboards; `@@unique` on `LocationQrCode.code` and `InspectionPhoto.sha256`
- [x] 1.22 `npx prisma migrate dev --name housekeeping_module` (migrate is working —
       see memory note), then `npx prisma generate`
- [x] 1.23 Seed script `prisma/seed-housekeeping.ts`: 8 bathrooms + 5 common areas +
       parking/back/front/guard room/electricity room/generator area/fuel tank for a
       demo center — **created as data rows, quantities never hard-coded in code**

### Phase 2 — RBAC, navigation, settings

- [x] 2.1 Add module keys to `src/lib/rbac.ts` `MODULE_ACCESS`:
      `housekeeping`, `hk_inspect`, `hk_issues`, `hk_generator`, `hk_reports`,
      `hk_admin`, `hk_requests`
- [x] 2.2 Add nav group "Housekeeping" to `src/components/Shell.tsx` (Inspections,
      Issues, Generator, Cleaning Requests, Reports, Setup)
- [x] 2.3 `src/lib/housekeeping/access.ts` — center-scoping helper (a CENTER_MANAGER
      sees only their `centerId`; ADMIN/OWNER see all), reusing `canManageCenter` shape
- [ ] 2.4 Settings page `/housekeeping/setup` (ADMIN/OWNER): tolerances, weightages, AI
      prompts + confidence threshold, retention days, SLA targets, email groups — config
      is live via API/DB with defaults; the editing form is deferred, see **D-08**
- [x] 2.5 `getSetting()/setSetting()` helpers with typed defaults over `HkSetting`

### Phase 3 — Locations & QR codes

- [x] 3.1 CRUD API `/api/housekeeping/locations` — create, rename, reorder, group by
      category, soft-delete, set GPS + geofence + angles + checklist
- [x] 3.2 Admin UI `/housekeeping/setup/locations` — list per center/floor, drag-reorder,
      "capture current GPS" button for lat/lng
- [x] 3.3 QR generation `POST /api/housekeeping/locations/[id]/qr` — random opaque code,
      server-side lookup only, rotation supported
- [x] 3.4 QR render + printable sheet `/housekeeping/setup/qr-sheet` — A4 grid of codes
      with centre/area labels. **Add `qrcode` dep** (or render SVG inline to avoid it —
      decide at implementation; inline SVG preferred to keep the dep list small)
- [x] 3.5 `GET /api/housekeeping/qr/[code]/resolve` — returns centre/floor/area for a
      scan; used by both staff and public client flows

### Phase 4 — Inspection round (the core flow)

- [x] 4.1 `POST /api/housekeeping/rounds` start / `POST .../rounds/[id]/complete`
- [x] 4.2 `POST /api/housekeeping/visits` — scan submit: resolves QR, stamps **server
      time**, validates geofence (haversine vs `geofenceRadiusM`), records device + GPS
- [x] 4.3 Verification engine `src/lib/housekeeping/verification.ts` — returns flags, does
      not hard-block except on geofence when configured to reject:
      - [x] geofence distance + accuracy sanity
      - [x] minimum dwell time per location
      - [x] impossible movement (distance/time between consecutive visits)
      - [x] rapid device switching
      - [x] scans unrealistically close together
- [x] 4.4 Photo upload `POST /api/housekeeping/photos` — **separate from the generic
      `/api/upload`**: writes outside `public/`, computes sha256 + pHash, stores
      capture-vs-server time, rejects non-image mime by magic bytes, enforces
      camera-capture (`capture="environment"`) with a gallery exception flag for managers
- [x] 4.5 Duplicate detection — exact sha256 match + pHash Hamming distance ≤ threshold,
      checked against the same location, other locations, and prior rounds
- [x] 4.6 Client-side quality gate — blur (Laplacian variance), darkness/overexposure
      (histogram), min resolution; prompt retake with the reason
- [x] 4.7 Mobile inspect UI `/housekeeping/inspect` — big buttons, QR scanner
      (`BarcodeDetector` with a jsQR fallback), 4 guided angle slots, progress bar,
      traffic-light scoring, voice/text note field
- [x] 4.8 Signed photo URLs `GET /api/housekeeping/photos/[id]/file` — HMAC + expiry,
      role-checked; never expose server paths
- [ ] 4.9 Round summary screen + `AreaSummary` generation on visit submit — partially done;
      `AreaSummary` blocked on Phase 5, see **D-07**

### Phase 5 — AI vision & analysis

- [ ] 5.1 `src/lib/housekeeping/ai/index.ts` — `analyzePhoto()`, `analyzeArea()`,
      `compareBeforeAfter()`, `readMeter()` against a driver interface
- [ ] 5.2 Drivers: `ollama.ts` (local multimodal), `openaiCompatible.ts` (fallback),
      `stub.ts` (deterministic, for dev + tests). Selected by `HK_AI_DRIVER`
- [ ] 5.3 Prompt templates in `src/lib/housekeeping/ai/prompts.ts`, admin-overridable via
      `HkSetting`; enforce the exact JSON contract from brief §6 with a Zod schema and a
      repair-retry on malformed output
- [ ] 5.4 Categories implemented as a typed taxonomy (cleanliness, consumables,
      maintenance, safety, presentation) — `src/lib/housekeeping/ai/taxonomy.ts`
- [ ] 5.5 Job runner `POST /api/housekeeping/cron/ai` (secret-guarded) — claims PENDING
      jobs, retries with backoff, marks FAILED after N attempts, never deletes evidence
- [ ] 5.6 Area consolidation — merge 4 photo findings into one `AreaSummary`
      (dedupe issues, worst-severity wins, weighted scores), diff against the previous
      visit for new/resolved/repeat + trend
- [ ] 5.7 Review UI — accept / correct / add / mark-N-A per finding; every correction
      persisted on `AiPhotoFinding` for later model evaluation
- [ ] 5.8 Store model name, version, confidence and analysis timestamp on every result

### Phase 6 — Issues & corrective actions

- [x] 6.1 Issue creation via a single `createIssue()` entry point (manual + inspection).
      AI auto-creation → deferred, see **D-04**
- [x] 6.2 Severity → due-time matrix from `HkSetting` (CRITICAL 2h / HIGH 8h / MEDIUM 24h /
      LOW 72h, admin-tunable). Auto-assign by shift/workload → deferred, see **D-06**
- [x] 6.3 Assignee flow: start → after-photo (required) → submit, plus an
      "unable to complete" path that returns the issue to ASSIGNED with the reason recorded
- [ ] 6.4 After-photo AI analysis + before/after comparison — blocked on Phase 5, see **D-05**
- [x] 6.5 Supervisor verify/close or reject → immutable `ReinspectionRecord` per decision.
      Four-eyes enforced: the assignee cannot sign off their own work
- [x] 6.6 Overdue escalation via `POST /api/housekeeping/cron/escalations` — idempotent via
      `escalatedAt`; grouped per centre; emails the configured list
- [x] 6.7 Critical-issue fast path — `isCriticalByNature()` pattern-matches hazards and forces
      CRITICAL severity (and its 2h SLA) regardless of the severity the reporter chose
- [x] 6.8 Housekeeping dashboard `/housekeeping/tasks` — assigned issues, severity, due,
      before image, inline after-image upload and submit

### Phase 7 — Generator monitoring

- [x] 7.1 Generator CRUD + assignment to centres
- [x] 7.2 `POST /api/housekeeping/generators/[id]/on` and `/off` — **server time only**,
      mandatory panel + tank photos, readings captured
- [x] 7.3 `ocrGeneratorPanel()` in `src/lib/ocr.ts` → fuel, hour-meter, voltage, current,
      frequency + per-field confidence (stub first, real driver behind the AI abstraction)
- [x] 7.4 30-minute photo requirement while ON: due-tracking, reminder, grace, escalation;
      interval admin-configurable
- [x] 7.5 Chronological reading ledger with `previousReadingId` + computed deltas
- [x] 7.6 Discrepancy engine `src/lib/housekeeping/generator-rules.ts` — all 12 rules from
      brief §11, each with a `ruleCode`, configurable tolerance, and a unit test:
      - [x] fuel changed with no ON event
      - [x] hour-meter increased with no ON event
      - [x] fuel dropped beyond tolerance without a run
      - [x] marked ON but hour-meter unchanged
      - [x] running but 30-min photo missing
      - [x] OCR vs manual entry beyond tolerance
      - [x] fuel increased with no refill entry
      - [x] consumption above normal L/h range
      - [x] reused photograph (pHash)
      - [x] backdated ON/OFF
      - [x] ON beyond max duration
      - [x] conflicting readings from two users
- [x] 7.7 Refill entries + diesel consumption trend
- [x] 7.8 Run-duration, fuel-difference and L/h computation on OFF
- [x] 7.9 `POST /api/housekeeping/cron/generator-checks` — detects the time-based rules
      (missed photo, still-ON overrun) without a user action

### Phase 8 — Alerts, dashboards, reports

- [x] 8.1 `EmailGroup` management (management/facility/accounts/security/centre-specific,
      TO + CC) + API. Admin *form* deferred with the rest of the settings UI — see **D-08**
- [x] 8.2 Alert engine — rule → `Alert` → recipients → `sendMail()` (existing lib) +
      in-app; email body carries centre, area, time, user, type, previous/current/delta,
      photos, AI findings, severity, action, deep link
- [x] 8.3 `NotificationLog` — generated, recipients, delivery status, read/ack,
      escalation, resolution
- [x] 8.4 In-app live alerts — 30s polling against `?since=`. *Polling chosen over SSE: it
      matches repo patterns and survives a serverless deploy where a long-lived connection
      would not*
- [x] 8.5 Management dashboard `/housekeeping` — facility score, today's compliance,
      centre-wise scores, open criticals, generator discrepancies, staff ranking,
      resolution time, missed inspections, daily/weekly/monthly trends
- [ ] 8.6 Centre dashboard — per-centre rollup (areas, compliance, open/critical issues,
      generator status) ships inside the management dashboard; the dedicated drill-down page
      with latest photo per area is deferred — see **D-21**
- [ ] 8.7 Supervisor dashboard — `/housekeeping/tasks` (Phase 6) already covers assigned work;
      the personal-compliance view is deferred — see **D-22**
- [x] 8.8 Efficiency scoring `src/lib/housekeeping/efficiency.ts` — configurable
      weightages (default 30/20/15/15/10/10 per brief §9), normalised for area size,
      occupancy, shift length and workload; per staff/shift/centre/area + trend +
      "reasons for reduction" + manual-override audit trail
- [x] 8.9 Reports (all 18 in brief §14) with filters (centre, date range, user, role,
      area, floor, status, category, severity, generator, shift)
- [x] 8.10 Exports — CSV + XLSX via the existing `xlsx` dep; PDF via the repo's existing
       print-to-PDF approach (check how proposals do it before adding a PDF dep)
- [x] 8.11 Scheduled digests — `POST /api/housekeeping/cron/daily-summary` and
       `/weekly-summary` emailing the configured groups

### Phase 9 — Client cleaning-request module (public QR)

- [x] 9.1 Public area page `/qr/a/[code]` — resolves centre/floor/area from the QR;
      company picker from the ERP `Client` list; no account required
- [x] 9.2 Action screen: Request Cleaning · Report Cleanliness · Report Maintenance ·
      Report Safety · Request Consumable · Give Feedback
- [x] 9.3 `CleaningRequestType` seeded with all 16 request types + 8 consumables, fully
      admin-editable (add/rename/deactivate)
- [x] 9.4 `POST /api/housekeeping/requests/public` — **rate-limited + no auth**; follow
      the existing `bfe8807` leads-capture guard pattern (shared secret + rate limit)
- [x] 9.5 Priority: client-selected Normal/Urgent + auto-urgent keyword/type rules
      (spill, wet floor, broken glass, overflow, biological waste, foul smell, safety)
- [x] 9.6 Ticket lifecycle: New → Assigned → Accepted → On the way → In progress →
      Completed → Awaiting confirmation → Closed / Reopened / Cancelled
- [x] 9.7 Auto-assignment by centre/floor/area/shift/availability/workload/type/priority
- [x] 9.8 Staff app actions: accept, on the way, started, completed, unable, needs
      maintenance — with **QR re-scan at the location required to complete**
- [ ] 9.9 After-cleaning photos (≥1, up to 4 for serious requests) + AI verification
      (completion status, post-score, remaining issues, confidence, needs-supervisor)
      — advisory only, never auto-rejects a staff completion
- [x] 9.10 Public status page `/qr/status/[token]` — no login; optional email/SMS hooks
- [x] 9.11 Client confirmation (satisfactory/partial/not completed) + 1–5 rating;
       "not completed" auto-reopens and notifies per escalation rules; admin can disable
       mandatory confirmation with auto-close after a configured window
- [x] 9.12 SLA targets per request type + the 9 SLA alert conditions from brief §32
- [x] 9.13 Request → complaint conversion rules (SLA breach, reopen, repeat within
       window, safety/maintenance detected, explicit escalate)
- [ ] 9.14 Cleaning-request analytics feeding the efficiency score — request data is captured
       and reportable; folding it into the staff score needs the same rosters as **D-19**

### Phase 10 — Security, audit & hardening

- [x] 10.1 `logAction()` on every state change (round, visit, issue, generator event,
       reading, alert, score override, setting change) with previous → new value
- [x] 10.2 Immutability — no delete routes for inspections, photos, readings, alerts,
       audit rows; admin corrections write a **new version row** preserving the original
- [x] 10.3 Photos stored **outside `public/`**, served only via signed, role-checked URLs
       (this is a deliberate departure from the existing public `/uploads/` pattern —
       inspection evidence must not be world-readable by URL guess)
- [x] 10.4 File-type verification by magic bytes, size caps, image re-encode on ingest
- [x] 10.5 Rate limiting on public request + QR resolve endpoints — `src/lib/housekeeping/rate-limit.ts`,
       per-IP and per-QR-code buckets on all three public routes
- [ ] 10.6 Device registration + revocation UI — devices recorded already; UI + `revokedAt`
       enforcement deferred, see **D-10**
- [x] 10.7 Middleware allowlist entries for the new public paths only — exactly three
       (`requests/public`, `requests/resolve`, `requests/status`); every other route stays session-protected
- [ ] 10.8 Retention job `POST /api/housekeeping/cron/retention` — purges photos past the
       configured window, keeps the metadata + audit rows
- [x] 10.9 Confirm no server path or AI credential ever reaches a client component — *verified: `filePath` appears only in API routes; clients receive photo ids and signed URLs*
- [ ] 10.10 `npx tsc --noEmit` clean (done every phase); manual acceptance pass → **D-09**

### Phase 11 — Deferred / optional (needs a platform decision first)

- [ ] 11.1 Offline mode — service worker, IndexedDB queue, encrypted local store, sync
       with original-capture vs synced-at timestamps, server timestamps never overridden
- [ ] 11.2 PWA manifest + install prompt + push notifications
- [ ] 11.3 Hindi/English i18n
- [ ] 11.4 MinIO/S3 storage driver
- [ ] 11.5 Test suites (no framework in the repo today — needs a Vitest/Playwright decision)
- [ ] 11.6 Docker + Docker Compose for app + local model + MinIO
- [ ] 11.7 OpenAPI/Swagger spec
- [ ] 11.8 User manual + admin manual

---

## 3a. Issue lifecycle (Phase 6 — shipped)

```
                    ┌──────────── reassign ────────────┐
                    ↓                                  │
  OPEN ──assign──> ASSIGNED ──start──> IN_PROGRESS ──submit──> AWAITING_VERIFICATION
                    ↑                       │                        │
                    │                  unable to                PASS │ FAIL
                    │                  complete                      │   │
                    └───────────────────────┘                 CLOSED ┘   └─> REJECTED
                                                             (terminal)      (rework →
                                                                              IN_PROGRESS)
```

Transitions are enforced server-side (`assertTransition`); an illegal move returns **409**
rather than silently doing nothing, so a double-tap in the field cannot corrupt history.
`CLOSED` and `CANCELLED` are terminal — a recurrence is a **new** issue, never a reopened one,
which keeps rectification-time statistics honest.

**Default SLA** (per severity, admin-tunable via `HkSetting` key `issues.config`):

| Severity | Due within | Notes |
|---|---|---|
| CRITICAL | 2 h | Auto-applied to hazards regardless of reported severity |
| HIGH | 8 h | |
| MEDIUM | 24 h | |
| LOW | 72 h | |

**Critical fast path.** `isCriticalByNature()` scans the title and description for hazard
phrases (exposed wire, open electrical panel, diesel/fuel leak, blocked emergency exit, major
water overflow, live wire, gas leak, sewage…). A match forces `CRITICAL` — a supervisor
under-rating "exposed wire near the washbasin" as LOW still gets a 2-hour SLA.

**Four-eyes rule.** The assignee cannot verify their own work (ADMIN/OWNER may override for
single-staff sites). Every verify/reject writes an immutable `ReinspectionRecord`.

**Escalation.** `POST /api/housekeeping/cron/escalations` — auth via `x-cron-secret:
$HK_CRON_SECRET` (crontab) or an authenticated manager. Idempotent: `escalatedAt` prevents
re-alerting, and is reset by reassignment or rework so a genuinely stalled issue re-escalates.
Recipients come from `HK_ESCALATION_EMAILS`, falling back to active admins/owners.

Suggested crontab entry:

```cron
*/30 * * * * curl -fsS -X POST -H "x-cron-secret: $HK_CRON_SECRET" \
  https://your-host/api/housekeeping/cron/escalations > /dev/null
```

## 3b. Generator monitoring (Phase 7 — shipped)

**Run lifecycle.** `POST /generators/[id]/on` requires a control-panel photograph AND a
fuel-tank photograph plus both readings; `POST /generators/[id]/off` requires a final tank and
meter photograph. `atServer` is always the database's `now()` — the operator's device clock is
stored separately as `atClaimed` and only used to detect backdating. A second ON while running
returns **409**, as does an OFF when not running.

**On shutdown** the run is closed out: duration, fuel used (accounting for any mid-run refill)
and litres/hour are computed and stored on the OFF event.

**Reading ledger.** Every reading links to its predecessor via `previousReadingId`, with
`fuelDelta`/`hourDelta` precomputed. Kinds: `START`, `PERIODIC` (the mandatory 30-minute
photograph), `STOP`, `REFILL`, `SPOT_CHECK`.

### The 12 rules (brief §11)

| # | `ruleCode` | Severity | Fires when |
|---|---|---|---|
| 1 | `GEN_FUEL_NO_EVENT` | CRITICAL | Fuel changed with neither a run nor a refill |
| 2 | `GEN_HOURS_NO_EVENT` | CRITICAL | Hour-meter advanced with no ON event — it ran unlogged |
| 3 | `GEN_FUEL_DROP_NO_RUN` | CRITICAL | Fuel fell beyond tolerance without a recorded run |
| 4 | `GEN_ON_NO_HOUR_CHANGE` | HIGH | Marked ON for >5 min but the hour-meter never moved |
| 5 | `GEN_MISSED_PERIODIC_PHOTO` | HIGH | Running, but no reading for interval + grace |
| 6 | `GEN_OCR_MISMATCH` | MEDIUM | OCR and typed reading disagree beyond tolerance |
| 7 | `GEN_FUEL_UP_NO_REFILL` | HIGH | Fuel rose with no diesel refill logged |
| 8 | `GEN_CONSUMPTION_HIGH` | HIGH | L/h above `normalLphMax × overrun factor` |
| 9 | `GEN_PHOTO_REUSED` | CRITICAL | Photograph already submitted (sha256 / pHash) |
| 10 | `GEN_BACKDATED_EVENT` | HIGH | Claimed time differs from server time beyond tolerance |
| 11 | `GEN_RUN_TOO_LONG` | HIGH | Still marked ON beyond `maxRunHours` |
| 12 | `GEN_CONFLICTING_READINGS` | MEDIUM | Two operators disagree within the conflict window |

Rules 1–4, 6–10 and 12 are evaluated on write. Rules **5 and 11 are absence-detection** — no
user action can trigger them — so they run from the cron.

**Tolerances** (`HkSetting` key `generator.config`, all admin-tunable):

| Setting | Default | Used by |
|---|---|---|
| `fuelToleranceL` | 5 L | rules 1, 3, 7, 12 |
| `hourToleranceH` | 0.1 h | rules 2, 4, 12 |
| `ocrMismatchFuelL` / `ocrMismatchHourH` | 10 L / 1 h | rule 6 |
| `backdateToleranceMin` | 15 min | rule 10 |
| `consumptionOverrunFactor` | 1.5× | rule 8 |
| `conflictWindowMin` | 10 min | rule 12 |

Per-generator: `photoIntervalMin` (30), `graceMin` (10), `maxRunHours` (12), `normalLphMin/Max`.

**Design note.** `generator-rules.ts` contains only pure functions over plain snapshots —
no Prisma imports — so all 12 rules are unit-testable without a database.
`generator-service.ts` gathers context and persists findings. Discrepancies are **never
deleted**; resolving one stamps `resolvedAt`/`resolvedById`/`resolution`.

Suggested crontab (pairs with the escalation job):

```cron
*/15 * * * * curl -fsS -X POST -H "x-cron-secret: $HK_CRON_SECRET" \
  https://your-host/api/housekeeping/cron/generator-checks > /dev/null
```

## 3c. Alerts, scoring & reports (Phase 8 — shipped)

**Alert engine** (`src/lib/housekeeping/alerts.ts`). One entry point, `raiseAlert()`, used by
issues, generator discrepancies and the crons.

- **Routing** — each alert type maps to `EmailGroup` kinds. Resolution order: centre-specific
  groups → global groups of the routed kinds → `HK_ESCALATION_EMAILS` → active ADMIN/OWNER
  emails. An alert therefore always reaches someone.
- **Dedupe** — `dedupeKey` is unique in the schema, so a repeating condition or a re-run cron
  alerts once. Keys are bucketed (e.g. `gen:<id>:<rule>:<hour>`, `summary:d:<centre>:<date>`).
- **Failure policy** — the `HkAlert` row is written *before* the email is attempted. A mail
  outage records `NotificationLog.status = FAILED`; the alert is still visible in-app. A
  notification is never lost because SMTP was down.
- **Severity gate** — CRITICAL interrupts by email; lower severities are recorded in-app and
  summarised in the daily digest, so a noisy rule cannot bury the inbox.

| Alert type | Raised by | Emails |
|---|---|---|
| `CRITICAL_ISSUE` | any issue at CRITICAL severity | immediately |
| `GENERATOR_DISCREPANCY` | the 12 generator rules | CRITICAL only |
| `ISSUE_OVERDUE` | `cron/escalations` | immediately |
| `DAILY_SUMMARY` | `cron/daily-summary` | per centre, once per day/week |

**In-app live alerts** — `/housekeeping/alerts` polls `?since=<iso>` every 30 s. Polling was
chosen over SSE deliberately: it matches the repo's existing patterns and survives a
serverless deployment where a long-lived connection would not.

**Efficiency scoring** (`efficiency.ts`) — five measurable factors, weights admin-tunable via
`HkSetting` key `efficiency.config`:

| Factor | Default weight | Measures |
|---|---|---|
| `sla` | 30% | closed within due time |
| `quality` | 25% | accepted without rework |
| `completion` | 20% | assigned work actually finished |
| `evidence` | 15% | after-photograph supplied |
| `severity` | 10% | critical/high handled on time |

Per the brief's explicit instruction, **volume of reported issues is never a factor** — only
how well work was handled once assigned. Factors with no data in the period are marked
unmeasurable and their weight is redistributed, with the reason recorded, so a quiet period
does not read as poor performance. Shift/area/occupancy normalisation is deferred (**D-19**).

**Reports** — all 18 from brief §14 share one `ReportTable` shape (mirroring
`src/lib/occupancy/reports.ts`), so CSV / Excel / print-PDF rendering is written once and every
report gets export for free. `GET /api/housekeeping/reports` with no `type` returns the menu.
The two AI reports return an empty table with an explanatory note rather than being absent
(**D-20**).

Suggested crontab (alongside the escalation and generator jobs):

```cron
0 19 * * *  curl -fsS -X POST -H "x-cron-secret: $HK_CRON_SECRET" \
  https://your-host/api/housekeeping/cron/daily-summary > /dev/null
0 18 * * 5  curl -fsS -X POST -H "x-cron-secret: $HK_CRON_SECRET" \
  "https://your-host/api/housekeeping/cron/daily-summary?period=weekly" > /dev/null
```

## 3d. Client cleaning requests (Phase 9 — shipped)

The module's **first public, unauthenticated surface**. Everything below assumes the caller is
hostile, because anyone who can photograph a sticker on a wall can reach these endpoints.

**Two separate QR code sets** (decided with the user, resolving D-13):

| Sticker | Model | Points at | Audience |
|---|---|---|---|
| Staff | `LocationQrCode` | `/housekeeping/scan/<code>` | supervisors — authenticated |
| Client | `ClientQrCode` | `/qr/a/<code>` | members — no login |

Both are opaque and resolved server-side. Keeping them distinct means a supervisor and a client
can never scan the wrong one, and the 60 existing staff printouts were unaffected.

**Public routes** — exactly three, each rate-limited and middleware-allowlisted:

| Route | Guard |
|---|---|
| `POST /api/housekeeping/requests/public` | 8/IP + 15/QR-code per 10 min |
| `GET /api/housekeeping/requests/resolve/[code]` | 40/IP per 10 min |
| `GET\|POST /api/housekeeping/requests/status/[token]` | 60 / 20 per IP per 10 min |

Everything else under `/api/housekeeping/*` stays session-protected — verified explicitly.

**Hardening applied to the submit endpoint:**

- The **QR code is the only way** to name a centre/area — a caller cannot pass one in.
- The client company must genuinely belong to that centre; a foreign id returns 400.
- All free text is length-capped server-side (description 1000, name 120, phone 20).
- Optional `HK_PUBLIC_SECRET` + same-origin check, mirroring the leads-capture pattern.
- The response returns only the ticket number and status token — **no internal ids**.

**Priority** — the client's choice is only ever raised, never lowered. `detectUrgency()` scans
the type and description for spill, wet floor, broken glass, overflow, biological waste, foul
smell, leak, fire/smoke/shock and "meeting"; a hit forces URGENT and halves the SLA target
(floor 5 min). Verified: "there is broken glass on the floor" on a 15-minute table-cleaning
request came back URGENT with an 8-minute target.

**Lifecycle** (brief §26) — transitions are enforced server-side; an illegal move is 409:

```
NEW → ASSIGNED → ACCEPTED → ON_THE_WAY → IN_PROGRESS → COMPLETED
                                                          ↓
                                    AWAITING_CONFIRMATION → CLOSED
                                                          ↘ REOPENED → ASSIGNED
```

**Completion requires evidence.** At least one after-photograph (duplicate-checked against
every prior request photo), plus an area QR re-scan. The scan is strictly validated — a code
belonging to another area is rejected **by name**. Requiring the scan is a setting
(`requireQrOnComplete`, default off — see D-24); when absent, completion is allowed but
recorded as `qrVerified: false` and audited.

**Complaint conversion** (brief §33) — a request becomes a complaint automatically on: client
verdict `NOT_COMPLETED`, any reopen, or an SLA breach. `cron/request-sla` handles the
time-based half and also auto-closes completions the client never confirmed.

Suggested crontab:

```cron
*/5 * * * * curl -fsS -X POST -H "x-cron-secret: $HK_CRON_SECRET" \
  https://your-host/api/housekeeping/cron/request-sla > /dev/null
```

Seed the catalogue (16 services + 8 consumables + 4 report actions) and one client QR per area:

```bash
npm run db:seed:cr      # idempotent
```

## 4. Role mapping (brief persona → existing ERP role)

No new role system. The brief's personas map onto the existing 9 roles:

| Brief persona | Existing role | Module keys |
|---|---|---|
| Super Admin | `ADMIN`, `OWNER` | all, incl. `hk_admin` |
| Senior Management | `OWNER`, `MANAGER` | `housekeeping`, `hk_reports` |
| Facility Manager | `MANAGER`, `OPS` | `housekeeping`, `hk_issues`, `hk_generator`, `hk_reports` |
| Community Manager | `CENTER_MANAGER` | `housekeeping`, `hk_inspect`, `hk_issues`, `hk_requests` |
| Supervisor | `OPS` | `hk_inspect`, `hk_issues`, `hk_requests` |
| Housekeeping Manager | `OPS` (+ `HkStaff` link) | `hk_issues`, `hk_requests` |
| Security / Generator Operator | `OPS` (+ `HkStaff.role=SECURITY`) | `hk_generator` |
| Client | `CLIENT` / anonymous | public QR screens only |

If the business needs true separation between Supervisor, Housekeeping Manager and
Security, add `HkStaff.staffRole` as the discriminator rather than new ERP roles —
`MODULE_ACCESS` already supports per-user overrides via `User.allowedModules`.

## 5. Acceptance criteria → phase

Status legend: ✅ shipped · ⬜ pending.

| # | Criterion (brief §21) | Phase | Status |
|---|---|---|---|
| 1 | Admin creates centre + inspection locations | 3 | ✅ |
| 2 | QR codes generated and printed | 3 | ✅ |
| 3 | Supervisor scans QR on mobile | 4 | ✅ |
| 4 | Server time, GPS, user, device, location recorded | 4 | ✅ |
| 5 | Out-of-geofence scans rejected/flagged | 4 | ✅ |
| 6 | Four live photos mandatory | 4 | ✅ |
| 7 | Duplicate photos detected | 4 | ✅ |
| 8 | AI structured findings | 5 | ⬜ |
| 9 | Consolidated area summary | 5 | ⬜ |
| 10 | Daily management summary | 8 | ✅ |
| 11 | Corrective actions assigned + closed with after photos | 6 | ✅ |
| 12 | Staff-efficiency scores calculated | 8 | ✅ |
| 13 | Generator ON/OFF recorded | 7 | ✅ |
| 14 | 30-minute generator photos enforced | 7 | ✅ |
| 15 | OCR extracts generator readings | 7 | 🔶 wired, stub engine — see D-17 |
| 16 | Alert when readings change with no ON event | 7 | ✅ |
| 17 | Emails sent to configured groups | 8 | ✅ |
| 18 | Centre-wise and staff-wise reports | 8 | ✅ |
| 19 | Works on mobile and desktop | 4, 8 | ✅ (inspect flow) |
| 20 | Inspection data survives AI failure | 5 | ⬜ |
| 21 | Critical changes in an immutable audit trail | 10 | ✅ (inspection actions) |
| 22 | Runs on local AI model + private storage | 5, 10 | ✅ private storage · ⬜ AI |

## 6. Files this module will add (planned)

```
prisma/schema.prisma                      (+~22 models)
prisma/seed-housekeeping.ts
src/lib/housekeeping/
  types.ts  validators.ts  route-helpers.ts  access.ts  settings.ts
  verification.ts  duplicates.ts  efficiency.ts  generator-rules.ts
  alerts.ts  reports.ts  storage.ts
  ai/index.ts  ai/ollama.ts  ai/openaiCompatible.ts  ai/stub.ts
  ai/prompts.ts  ai/taxonomy.ts
src/app/api/housekeeping/**               (locations, qr, rounds, visits, photos,
                                           issues, generators, requests, alerts,
                                           reports, settings, cron/*)
src/app/(app)/housekeeping/**             (dashboard, inspect, tasks, issues,
                                           generator, requests, reports, setup)
src/app/qr/[code]/**                      (public client screens)
src/lib/ocr.ts                            (+ ocrGeneratorPanel)
src/lib/rbac.ts  src/components/Shell.tsx src/middleware.ts   (edits)
```

## 7. Conventions to follow

- Route handlers use `requireUser()/parseBody()/handleError()` from
  `src/lib/housekeeping/route-helpers.ts` — mirroring `src/lib/occupancy/`.
- All business logic in `src/lib/housekeeping/`, never in the route file.
- Every mutation calls `logAction()`.
- Every list endpoint is centre-scoped through `access.ts`.
- Cron endpoints are `POST` + `HK_CRON_SECRET` header, triggered by external crontab
  (same as the existing `run-monthly` / `run-reminders` routes).
- On completion: add a requirement→implementation entry to
  [feature-log.md](./feature-log.md), a dated entry to [CHANGELOG.md](./CHANGELOG.md),
  and a pointer in [README.md](./README.md).
