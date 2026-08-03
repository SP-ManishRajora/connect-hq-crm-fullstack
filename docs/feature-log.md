# Feature Log — Requirements → Implementation

A running record of feature requirements and what was built for each. Newest first.
For module-deep design see the dedicated `*-module.md` docs; for the shipped-changes
changelog see [CHANGELOG.md](./CHANGELOG.md).

---

## Housekeeping — Client Cleaning Requests (Phase 9)

**Requirement:** Clients scan an area QR, pick their company, and raise a cleaning request or
report a problem in under 30 seconds with no account. Auto-priority, auto-assignment, a full
ticket lifecycle, QR-verified completion, client confirmation with rating, SLA targets and
automatic complaint conversion (brief §§23–35).

**Built** (design in [housekeeping-module.md](./housekeeping-module.md) §3d):
- **5 models** (`housekeeping_cleaning_requests` migration): `CleaningRequestType`,
  `ClientQrCode` (deliberately separate from the staff `LocationQrCode`), `CleaningRequest`,
  `CleaningRequestEvent` (append-only trail), `CleaningRequestPhoto`.
- **Seed** `npm run db:seed:cr` — 16 cleaning services + 8 consumables + 4 report actions with
  per-type SLA targets from brief §32, plus a client QR for each of the 60 areas.
- **`rate-limit.ts`** — extracted from the proven leads-capture pattern; per-IP **and**
  per-QR-code buckets, `Retry-After` on 429, magic-byte and length capping helpers.
- **`requests.ts`** — lifecycle state machine (409 on illegal moves), `detectUrgency()` keyword
  and type rules, ticket numbering, workload-balanced auto-assignment, complaint-conversion
  rules.
- **3 public routes** (submit / resolve / status+confirm) and **4 staff routes** (list, action,
  photo, `cron/request-sla`). Middleware allowlists exactly the three public paths.
- **Screens:** `/qr/a/[code]` (company picker → 6-action screen → detail → confirmation, no
  login), `/qr/status/[token]` (progress timeline, auto-refresh, 1–5 rating and confirmation),
  `/housekeeping/requests` (staff console), `/housekeeping/setup/client-qr-sheet` (printable
  client stickers, visually distinct from the staff sheet).
- **Verified:** `tsc` + production build clean. End-to-end with **no session**: resolve 200,
  public page renders, submit 201 returning only a ticket number and token (**no internal
  ids**). Abuse cases — unknown QR **404**, client id from another centre **400**, missing type
  **400**, 2000-char description **stored at 1000**. Auto-urgent fired on both keyword
  ("broken glass" → URGENT, 15 min → 8 min) and type (spill → 5 min). **Rate limit cut in
  exactly at the 8th request with `retry-after: 563`.** Staff lifecycle assign→accept→on the
  way→start all 200; complete without a photo **400**; complete with a **wrong-area QR rejected
  by name**; correct QR → `qrVerified: true`. Client `NOT_COMPLETED` → REOPENED + auto-flagged
  complaint + rating stored. SLA cron flagged 5 then **0 on re-run**. Confirmed every other
  `/api/housekeeping/*` route still returns 307 without a session. Test data removed.

**Cleared from the deferred ledger:** **D-11** (public rate limiting — now mandatory and done)
and **D-13** (printed QR pointed at a staff-only page — resolved by using two separate code
sets, so nothing needed reprinting).

**Deferred with reason:** rate limiting is in-memory and per-instance (**D-23**); QR re-scan on
completion is permissive by default until stickers are physically deployed (**D-24**); AI
verification of after-photos is blocked on Phase 5 (**D-25**); folding request analytics into
the staff efficiency score needs the same rosters as **D-19**.

---

## Housekeeping — Alerts, Dashboards & Reports (Phase 8)

**Requirement:** Configurable email groups, an alert engine that emails and logs delivery,
in-app live alerts, management/centre/supervisor dashboards, staff-efficiency scoring with
configurable weightages, all 18 reports from brief §14 with filters, CSV/Excel/PDF export, and
scheduled daily/weekly digests (brief §§8, 9, 12, 13, 14).

**Built** (design in [housekeeping-module.md](./housekeeping-module.md) §3c):
- **4 models** (`housekeeping_alerts_scoring` migration): `EmailGroup` (TO + CC, kind, optional
  centre scope), `HkAlert` (unique `dedupeKey`), `NotificationLog` (append-only delivery
  record), `HkEfficiencyScore` (computed value plus a separate override field so a manual
  adjustment never destroys the computed one).
- **`alerts.ts`** — one `raiseAlert()` entry point. Recipients resolve centre-specific →
  global-by-kind → env → active admins, so an alert always reaches someone. The alert row is
  written **before** the email is attempted, so an SMTP outage logs `FAILED` and the alert is
  still visible in-app. CRITICAL emails immediately; lower severities ride the daily digest.
- **`efficiency.ts`** — five measurable factors (SLA adherence, first-time-right, completion,
  evidence discipline, high-severity handling), weights admin-tunable. Per the brief's explicit
  instruction, **issue volume is never a factor**. Factors with no data are marked unmeasurable
  and their weight redistributed with the reason recorded, so a quiet period is not punished.
- **`reports.ts`** — all 18 reports on one `ReportTable` shape mirroring the occupancy module,
  so CSV / Excel / print-PDF rendering is written once. `dashboard.ts` supplies the aggregates.
- **7 API routes:** reports (menu + 4 formats), alerts list (also the `?since=` polling
  endpoint), alert ack, email-groups list/create, `cron/daily-summary` (`?period=weekly`).
  `cron/escalations` and every generator discrepancy now route through the alert engine.
- **Screens:** `/housekeeping` (facility score, centre rollup, 14-day trend, staff ranking,
  recent alerts), `/housekeeping/reports` (filters + three export buttons),
  `/housekeeping/alerts` (feed with delivery status, 30s polling, acknowledge).
- **Verified:** `tsc` + production build clean. End-to-end HTTP test: **all 18 reports return
  200** with real rows where data exists (60 areas, 24 bathrooms, 3 centres) and an explanatory
  note where it does not; CSV headers correct, XLSX magic bytes `504b0304`, PDF carries the
  print button; unknown report type **400**; invalid group email **400**; a hazard reported as
  LOW auto-escalated to CRITICAL → alert raised → emailed to the configured group → delivery
  logged `SENT`; acknowledge **200** then **409**; daily digest sent once then **0 on re-run**
  (deduped) with weekly independently keyed; unauthenticated cron **307**. Test data removed.

**Cleared from the deferred ledger:** **D-14** (escalation recipients now use `EmailGroup`) and
**D-18** (generator discrepancies now auto-alert).

**Deferred with reason:** efficiency scoring is not yet workload-normalised (**D-19**, needs
`HkStaff` rosters — same blocker as D-06); the two AI reports return empty tables until Phase 5
(**D-20**); the dedicated centre drill-down (**D-21**) and supervisor personal-compliance view
(**D-22**) are deferred as they overlap existing screens and are better designed once Phase 5
supplies photo summaries. `AlertRule`/`AlertRecipient` tables from item 1.18 were deliberately
not built — routing is code-driven and recipients resolve from `EmailGroup`, so a DB rule table
would be indirection with no caller.

---

## Housekeeping — Generator Monitoring (Phase 7)

**Requirement:** Record generator ON/OFF on server time with mandatory panel and tank
photographs, require a fresh photograph every 30 minutes while running, extract readings by
OCR, maintain a chronological fuel/hour ledger, log diesel refills, and raise an immediate
alert on any of 12 defined discrepancies (brief §11).

**Built** (design in [housekeeping-module.md](./housekeeping-module.md) §3b):
- **6 models** (`housekeeping_generator_monitoring` migration): `Generator`,
  `GeneratorEvent` (server time authoritative, `atClaimed` stored separately so backdating is
  detectable), `GeneratorReading` (append-only ledger chained via `previousReadingId` with
  precomputed deltas), `GeneratorPhoto`, `GeneratorRefill`, `GeneratorDiscrepancy`.
- **`generator-rules.ts`** — all 12 rules as **pure functions over plain snapshots**, no
  Prisma imports, so the engine is unit-testable without a database. Every tolerance comes
  from `HkSetting` (`generator.config`); nothing is hard-coded.
- **`generator-service.ts`** — gathers run/refill context, runs the rules, persists findings
  with a dedupe window so a repeating cron cannot spam the same rule.
- **`ocrGeneratorPanel()`** in `src/lib/ocr.ts` — invoked on every panel/meter photograph and
  its output stored on the reading. Deliberately returns nulls at confidence 0 until a real
  engine is configured, so operator-typed readings stay authoritative (see **D-17**).
- **9 API routes:** generators list/create, `[id]/on`, `[id]/off` (computes duration, fuel
  used net of mid-run refills, and L/h), `[id]/readings` (ledger + periodic reading),
  `[id]/refills` (+ consumption trend), `discrepancies`, `discrepancies/[id]/resolve`
  (may escalate into the Phase 6 issue workflow), signed generator-photo serving, and
  `cron/generator-checks` for the two absence-detection rules.
- **Screen** `/housekeeping/generator` — live running state with elapsed time, an overdue-photo
  banner, ON/OFF/reading/refill panels with mandatory camera capture, and open-discrepancy
  triage with inline resolution.
- **Verified:** `tsc` + production build clean. **24/24 rule assertions passed** — all 12 rules
  fire on their trigger case, and 12 negative cases confirm no false positives (fuel drop
  *with* a run, fuel rise *with* a refill, drift inside tolerance, OCR at confidence 0, same
  user, short run…). End-to-end HTTP test also confirmed: ON without photos **400**, double-ON
  **409**, OFF when off **409**, reused tank photo → `GEN_PHOTO_REUSED`, a 2 h run burning
  29.95 L/h against a 15 L/h ceiling → `GEN_CONSUMPTION_HIGH` + `GEN_ON_NO_HOUR_CHANGE`,
  cron → `GEN_RUN_TOO_LONG` then `GEN_MISSED_PERIODIC_PHOTO`, dedupe 0 on re-run, refill over
  tank capacity **400**, resolve then re-resolve **409**. Test data removed.

**Deferred with reason:** OCR is a stub (**D-17**) — acceptance criterion #15 is wired but not
satisfied until `HK_OCR_DRIVER` points at a real engine. Discrepancies do not yet auto-create
issues or emails beyond the cron digest (**D-18**, Phase 8's alert engine).

---

## Housekeeping — Issues & Corrective Actions (Phase 6)

**Requirement:** When an issue is detected, create a ticket, set severity and a due time,
assign it, let the assignee mark work started, require an after-photograph, allow a supervisor
to verify and close, and escalate overdue items automatically (brief §10).

**Built** (design + checklist in [housekeeping-module.md](./housekeeping-module.md) §3a):
- **3 models** (`housekeeping_issues_corrective_actions` migration): `HkIssue`,
  `CorrectiveAction` (one row per work *attempt* — a rejected attempt keeps its record),
  `ReinspectionRecord` (immutable, one per verify/reject). Plus enums `HkSeverity`,
  `HkIssueStatus`, `HkIssueSource`. A follow-up migration made `InspectionPhoto.visitId`
  optional so an after-photo can belong to an issue rather than an inspection visit.
- **`src/lib/housekeeping/issues.ts`** — SLA matrix (CRITICAL 2h / HIGH 8h / MEDIUM 24h /
  LOW 72h, admin-tunable), an explicit state machine (`assertTransition` → 409 on an illegal
  move), `isCriticalByNature()` hazard detection, and `createIssue()` as the single creation
  path that Phase 5 (AI) and Phase 9 (client requests) will reuse via `source`.
- **7 API routes:** list/create `issues`, `[id]/assign` (re-triage resets the SLA clock),
  `[id]/start`, `[id]/complete` (after-photo required; "unable to complete" returns it to
  ASSIGNED with the reason), `[id]/verify` (PASS→CLOSED, FAIL→REJECTED), `[id]/photo`
  (private storage + duplicate detection), `cron/escalations`.
- **Screens:** `/housekeeping/issues` (console — raise, filter open/overdue/mine, triage
  drawer with side-by-side before/after) and `/housekeeping/tasks` (assignee view: start,
  after-photo, submit, unable-to-complete). "+ Issue" added to the inspection flow so a
  problem found mid-round becomes a tracked issue with the captured photo as before-evidence.
- **Controls:** four-eyes verification (assignee cannot sign off their own work; ADMIN/OWNER
  override for single-staff sites); CLOSED/CANCELLED terminal so a recurrence is a new issue,
  keeping rectification stats honest; every transition writes an `HK_ISSUE_*` audit row.
- **Verified:** `tsc` + production build clean, and an end-to-end two-user HTTP test —
  complete-before-start **409**, submit without after-photo **400**, self-verify **403**,
  reject→rework→resubmit→close, re-verify a closed issue **409**, escalation cron
  **1 escalated then 0 on re-run** (idempotent) with a correctly formatted email carrying
  severity, area, assignee, hours overdue and a deep link. Test data removed.

**Deferred with reason:** 6.1 AI auto-creation and 6.4 after-photo AI comparison are blocked
on Phase 5 — the hooks exist (`source: AI`, hashed after-photos, side-by-side rendering).
Auto-assignment by shift/workload needs `HkStaff` (item 1.13); assignment is manual pick plus
an optional per-centre default today.

---

## Housekeeping Inspections — QR rounds, GPS verification & photo evidence (Phases 1/3/4)

**Requirement:** QR-based centre inspections where supervisors scan an area code, the system
proves they are physically present, and four live photographs are captured per area — with
duplicate-photo detection, an immutable audit trail, and evidence that cannot be read by URL
guess. Full brief in [houskeepingFeacture.md](./houskeepingFeacture.md); design, decisions and
the remaining phase checklist in [housekeeping-module.md](./housekeeping-module.md).

**Built** (extends the existing `Center`/`Floor` models, 9-role RBAC and `logAction()` audit —
no second backend, no AI microservice):
- **9 Prisma models** (`housekeeping_inspection_module` migration): `InspectionLocation`,
  `LocationQrCode`, `InspectionRound`, `InspectionVisit`, `InspectionPhoto`, `GpsLog`,
  `DeviceRegistration`, `HkSetting` + 4 enums. Inspection areas are deliberately **not**
  `Space` rows — `Space` is rentable inventory and overloading it would corrupt occupancy maths.
- **Service layer** `src/lib/housekeeping/`: `verification.ts` (geofence, dwell, impossible
  movement, rapid rescan, device switch), `geo.ts` (haversine), `storage.ts` (private files +
  HMAC signed URLs + magic-byte sniffing), `phash.ts`, `settings.ts` (admin-tunable tolerances),
  `client-capture.ts` (device id, GPS, blur/exposure scoring, average-hash).
- **APIs:** locations CRUD + reorder + soft-delete, QR mint/rotate, rounds start/complete,
  `POST /visits` (server-time scan + verification), `POST /photos` (private upload, sha256 +
  pHash duplicate detection, camera-only with flagged manager gallery exception),
  `POST /visits/[id]/submit` (distinct-slot photo enforcement + dwell check),
  `GET /photos/[id]/file` (signed **and** session **and** centre checked).
- **Screens:** `/housekeeping/setup` (areas, per-area GPS capture, QR rotation),
  `/housekeeping/setup/qr-sheet` (printable A4, inline SVG), `/housekeeping/inspect`
  (mobile round: scan → 4 guided angles → quality warnings → submit),
  `/housekeeping/scan/[code]` (phone-camera landing). Sidebar group + 7 module keys in RBAC.
- **Seed:** `npm run db:seed:hk` — idempotent; created 60 areas + 60 QR codes across 3 centres.
- **Security:** photos in `private-uploads/` (gitignored), never under `public/`; every
  mutation writes an `HK_*` audit row; soft-delete only; QR rotation retires rather than mutates.
- **Verified:** `tsc` clean, production build clean, and an end-to-end HTTP smoke test —
  login → round → scan → 4 uploads → submit → complete. Confirmed: exact-duplicate photo
  flagged, non-image rejected (415), 3-of-4 submit blocked (400), `TOO_FAST` raised at 36s vs
  90s minimum, unsigned/forged photo URLs 403, valid signed URL 200 with real JPEG bytes.
  Test data removed afterwards.

**Not built yet:** AI vision analysis (Phase 5), issues/corrective actions (6), generator
monitoring (7), alerts/dashboards/reports (8), client cleaning requests (9). Those five
screens are nav-reachable placeholders that state their phase.

---

## Client Portal — Login, Registration & Meeting-Room Booking

**Requirement:** Secure client authentication (register via emailed link with a manageable
number of logins, log in/out, password reset), a client dashboard (welcome, upcoming bookings,
history, available rooms, booking status), meeting-room browsing with details + date/time/capacity
filters, and booking with double-booking prevention, past-date rejection, and cancellation rules.

**Built** (extends existing JWT/bcrypt auth + `MeetingRoom`/`Booking` models — see
[client-portal-booking.md](./client-portal-booking.md) for the full guide):
- **`ClientInvite` model** — single token store for `INVITE` (72h) + `RESET` (2h) flows; crypto-random,
  single-use, time-boxed. `MeetingRoom.amenities` added (JSON-array text).
- **`src/lib/client-auth.ts`** — invite/reset helpers, `loginCapFor` (cap = `max(1, occupiedSeats)`,
  counts active client users + pending invites), `passwordError` (≥8 chars, letters+numbers).
- **Auth routes:** `POST /api/clients/[id]/invites` (staff, cap-enforced, emails + returns link),
  `GET|POST /api/auth/register`, `POST /api/auth/forgot-password` (anti-enumeration),
  `GET|POST /api/auth/reset-password`. Public pages `/register`, `/forgot-password`, `/reset-password`
  + middleware allowlist; "Forgot password?" on login.
- **Booking:** `POST /api/bookings/[id]/cancel` (own-only, 60-min cutoff, staff override); past-date
  guard added to `POST /api/bookings`; `GET /api/meeting-rooms` with `centerId`/`minCapacity`/`start`+`end`
  availability annotation; `POST` accepts amenities; login-cap + password policy added to
  `POST /api/clients/[id]/employees`.
- **Client dashboard** (`/client-portal`): summary tiles, upcoming bookings + cancel, room browser with
  date/time/capacity filters + live availability + amenity badges, booking form, history table
  (existing tickets/feedback/notices/invoices preserved). Amenities input on staff Add-Room;
  "Invite via email" on client detail.
- **Verified:** `tsc` clean; automated E2E 22/23 (the miss was a test artifact — unauth API calls get a
  307 redirect to `/login` from middleware, so still blocked).

---

## Searchable category combobox (Inventory & Repairs)

**Requirement:** Category fields should be a search box with a dropdown that filters as you
type and offers an "Add" option when the typed text matches nothing. On opening the form,
show a non-selectable "Select category" prompt by default.

**Built:**
- New reusable component **`src/components/ComboBox.tsx`** — search input + filtered dropdown;
  click to select, Enter to commit, Esc/outside-click to revert; shows a green
  "+ Add '<text>'" row when no option matches (gated by an `allowAdd` prop).
- **Inventory → Consumables → Category** (`inventory/InventoryClient.tsx`): uses ComboBox; options
  = built-in defaults + categories already used by existing items; new categories save as free
  text (the `category` column is a plain string). Default empty → "Select category" placeholder.
- **Repairs → Log Repair → Category** (`repairs/RepairsClient.tsx`): uses ComboBox; categories are
  DB rows (`RepairCategory`), so adding a new one **persists via `POST /api/repair-categories`**
  and is **admin/owner-only** (`allowAdd={isAdmin}`); new category appears immediately. Default
  empty → "Select category" placeholder; required on submit.

---

## Occupancy Tracking Module (Phases 1–6)

**Requirement:** A complete space-occupancy management module — hierarchy, statuses, visual
map, allocations, reservations, transfers, history, dashboard, reports — fitted to the
existing codebase (Center/Cabin/Seat/Client/Contract/AuditLog/RBAC), not greenfield.

**Built (phase by phase):** see **[occupancy-module.md](./occupancy-module.md)** for the full
design, decisions, and phase status, and **[occupancy-and-seatmap-functionality.md](./occupancy-and-seatmap-functionality.md)**
for behavior/business rules. Summary:
- **P1** schema (`Floor/Zone/Space/Allocation/OccupancyHistory/Reservation/SpaceTransfer` + enums),
  migration, idempotent backfill, seat↔space sync helper, sidebar entry + RBAC modules, overview page.
- **P2** service layer (`service.ts` allocate/release/reserve/transfer, `validators.ts` Zod DTOs,
  `events.ts` in-process emitter → AuditLog).
- **P3** REST APIs (spaces CRUD, allocations, reservations, transfers) + allocation backfill via the service.
- **P4** dashboard KPIs + reports (occupancy/vacancy/utilization/client/revenue; CSV + print-PDF).
- **P5** spaces table UI (server-side filter + pagination + inline actions).
- **P6** interactive map (5-color legend, zoom, filter, click-to-act); **Seat Map retired**
  (`/seatmap` → redirect to `/occupancy/map`, sidebar item removed); sync intentionally kept
  (Space not yet authoritative — billing still reads `Seat.occupied`).
- Reserved spaces show the **held-for client** (initials on tile, name in tooltip + detail).
- RBAC: `occupancy` (view), `occupancy_manage`, `occupancy_reports` — CENTER_MANAGER included in all three.

**Deferred:** drop the sync / make Space authoritative (after billing migrates to Space);
per-seat "partial occupancy" on the new map; Phase 7 (reservation-expiry cron) and Phase 8 (RBAC/audit polish).

---

## Lead status — move to any stage with a comment

**Requirement:** Allow a lead's status to move to ANY status (not just next/previous), but
require a comment on every change.

**Built:** `src/lib/leadStatus.ts` — `allowedNextStatuses` returns every status except the
current; `canTransition` allows any known target. API (`api/leads/[id]/route.ts`) keeps the
comment-required gate; the status-change is logged as a `STATUS`-channel comment. Both the
table and detail UIs list all statuses.

## Lead comments — editable with full edit history

**Requirement:** Status/update comments should be editable, keeping a log of every version.

**Built:** `Comment` gained `editedAt/editedById` + a new append-only **`CommentEdit`** table
(prev body, editor, timestamp). `PATCH/DELETE /api/leads/[id]/comments/[commentId]` snapshots
the prior body before each edit. LeadDetail shows inline edit + a "History (n)" toggle.

## Proposals — send/resend with editable email composer

**Requirement:** Sending/resending a proposal opens an email composer (editable subject +
body preview) with the recipient auto-populated/editable; confirm before sending; allow resend;
show a "sent" mark. Use a formatted SweetAlert.

**Built:**
- Real email sending via SMTP moved to **`src/lib/mail.ts`** (server-only; nodemailer kept out
  of the client bundle — fixed an `fs`-in-client build error). Falls back to console when SMTP unset.
- Send route `GET` returns default subject/body; `POST` accepts edited subject/body + an
  "include proposal link" toggle, validates the recipient, persists a changed email to the lead.
- Composer modal (recipient/subject/body/link checkbox) replaces the instant send; **Resend**
  available on SENT proposals; "✓ Sent <when> to <whom>" shown on the row + drawer; SweetAlert2
  result dialogs.

## Proposal PDF — edit, print, save, consistent font & logo

**Requirement:** Let users edit the proposal PDF content and print; use one industry-standard
font; show the logo; aesthetic photos under "Membership Details" when a proposal has none.

**Built:** `api/proposals/[id]/pdf` gained `?edit=1` (editable fields + Save/Print toolbar);
`POST` persists DB-backed fields and writes an HTML snapshot (`Proposal.pdfSnapshot`). Template
unified to Helvetica/Arial; logo moved to `public/logo.png` and referenced absolutely; the
template's default photo gallery is kept when a proposal has no images of its own; missing
image files are skipped at render time (+ dangling DB references cleaned).
