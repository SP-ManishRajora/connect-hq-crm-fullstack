# Housekeeping Module — Deferred Items & Open Decisions

Running ledger of everything **consciously left undone inside a phase that was otherwise
marked complete**, plus decisions still waiting on the business.

This is deliberately *not* a list of un-built phases — the roadmap in
[housekeeping-module.md](./housekeeping-module.md) covers those. An item belongs here only if
it satisfies one of:

- **D — Deferred:** a phase was called done while this specific piece was skipped, with a reason.
- **B — Blocked:** it cannot be built until another phase exists.
- **Q — Open question:** it needs a business decision, not engineering time.
- **W — Workaround in place:** something ships today, but a better version is planned.

**Process:** add a row the moment a phase is closed with a gap. After Phase 10, work this
ledger to empty. Nothing here is a bug — every row is a decision with a reason recorded.

Last updated: **2026-08-03** (after Phase 8).

---

## Open — needs a decision from the business

| # | Item | Type | Why it matters | Blocks |
|---|---|---|---|---|
| D-01 | **Confirm role mapping** (module doc §4). Supervisor, Housekeeping Manager and Security all currently map to the existing `OPS` role. | Q | If these need genuine separation, assignment rules, efficiency scoring and generator permissions all change. Cheaper to settle before Phases 7–8 build on top of the current mapping. Suggested fix if separation is needed: add `HkStaff.staffRole` as the discriminator rather than new ERP roles — `MODULE_ACCESS` already supports per-user overrides. | 7, 8 |
| D-02 | **Photo retention period.** No default chosen; the retention job (10.8) cannot be written without a number. | Q | Inspection evidence accumulates fast (4 photos × ~20 areas × daily × N centres). Also a privacy posture question — the brief asks for a configurable retention period. | 10.8 |
| D-03 | **Geofence default radius.** Currently hard-defaulted to **50 m** per location in the schema; never confirmed. | Q/W | 50 m is generous for indoor areas in one building — it may not distinguish "in the bathroom" from "in the corridor". Needs a real-world check once GPS points are captured. | — |

## Deferred inside completed phases

| # | Item | Phase | Type | What ships today | What's still missing |
|---|---|---|---|---|---|
| D-04 | **AI auto-creation of issues** (6.1) | 6 | B | `createIssue()` is the single creation path, already accepting `source: AI`. Manual + inspection sources work. | Phase 5 calls it with AI findings above the confidence threshold. No rewrite needed — one call site. |
| D-05 | **After-photo AI analysis & before/after comparison** (6.4) | 6 | B | After-photos are captured, sha256/pHash hashed, duplicate-checked, and the before/after pair renders side by side for **human** comparison. | Automated "does this look cleaned?" verdict from Phase 5's `compareBeforeAfter()`. |
| D-06 | **Auto-assignment by shift / availability / workload** (6.2) | 6 | W | Manual assignee pick, plus an optional per-centre default assignee in `HkSetting`. | Needs `HkStaff` + `HkStaffAssignment` (item 1.13) for shift and workload data. Planned with Phase 8 efficiency scoring. |
| D-07 | **Round summary screen + `AreaSummary` generation** (4.9) | 4 | B | Round completion computes locations inspected/missed, distance travelled and a completion score, returned by the API. | The consolidated per-area summary (cleanliness/maintenance/safety scores, repeat-issue diff vs the previous visit) is Phase 5.6 — it needs AI findings to consolidate. |
| D-08 | **Settings UI** (2.4) | 2 | W | All config is live and admin-tunable **via the API/DB**: `inspection.config` (geofence rejection, GPS accuracy, travel speed, rescan gap, clock skew, gallery permission) and `issues.config` (SLA hours per severity, after-photo requirement, default assignees). Sensible defaults ship, so nothing is blocked. | A form at `/housekeeping/setup` to edit these without touching the database. Deliberately deferred until Phases 7–8 add their own settings, so the page is built once. |
| D-09 | **Manual acceptance-criteria pass** (10.10) | 10 | D | `tsc` and production build are verified clean on every phase, and each shipped phase has an end-to-end HTTP smoke test. | A single deliberate walk through all 22 acceptance criteria in §5 on real devices, once Phases 5/7/8/9 exist. |
| D-10 | **Device registration & revocation UI** (10.6) | 10 | W | Device IDs are recorded on every scan; `DeviceRegistration` rows are created and `revokedAt` exists in the schema. Rapid device switching is already flagged. | An admin screen to list a user's devices and revoke one. No enforcement of `revokedAt` at scan time yet — **add this when the UI lands**. |
| D-11 | ~~Rate limiting on public endpoints~~ (10.5) | 10 | — | **Cleared 2026-08-03 (Phase 9).** `src/lib/housekeeping/rate-limit.ts` applies per-IP **and** per-QR-code buckets to all three public routes, with `Retry-After` on 429. Middleware allowlists exactly those three paths; every other housekeeping route stays session-protected (verified). | — |

## Technical workarounds worth revisiting

| # | Item | Type | Current approach | Revisit when |
|---|---|---|---|---|
| D-12 | **Perceptual hash computed client-side** | W | No image decoder in the stack (sharp/jimp is heavy for one hash), so the browser computes an 8×8 average hash and the server stores/compares it. Server-side **sha256 over the real bytes stays authoritative** for exact duplicates, so a tampered client can only forge its own soft signal. | Phase 5 adds a server-side image pipeline — recompute pHash there and treat the client value as a hint only. |
| D-13 | ~~Printed QR points at `/housekeeping/scan/<code>`~~ | — | **Cleared 2026-08-03 (Phase 9).** Resolved by using **two separate code sets** (user's decision): `LocationQrCode` → `/housekeeping/scan/<code>` for staff, and a new `ClientQrCode` → `/qr/a/<code>` for clients. A staff sticker and a client sticker can never be confused, and the existing 60 staff printouts keep working unchanged. | — |
| D-14 | ~~Escalation recipients via env var~~ | — | **Cleared 2026-08-03 (Phase 8).** All alerts now resolve recipients through `EmailGroup` (centre-specific → global by kind), with `HK_ESCALATION_EMAILS` and active ADMIN/OWNER retained only as last-resort fallbacks so an alert is never undeliverable. | — |
| D-15 | **Photo storage is local disk only** | W | `private-uploads/` outside `public/`, served via HMAC-signed, session- and centre-checked URLs. `HK_STORAGE_DRIVER` is reserved but only `local` is implemented. | Phase 11.4 (MinIO/S3). The `storage.ts` interface is narrow enough that this is a driver swap, not a rewrite. |
| D-16 | **No thumbnail generation** | W | Full-size images are served through the signed URL for both list and detail views. Fine at current volumes; wasteful on a slow mobile connection over many issues. | Phase 5's server-side image pipeline — generate thumbnails at ingest, add `thumbPath` (already in the module doc's field list for `InspectionPhoto`). |
| D-17 | **`ocrGeneratorPanel()` is a stub** | D/W | The OCR call is fully wired into the ON / OFF / periodic-reading flow: it is invoked on every panel and meter photograph, and its output (`ocrFuel`, `ocrHourMeter`, `ocrConfidence`, `ocrRaw`) is stored on the reading. The stub deliberately returns **nulls with confidence 0** rather than invented numbers, so the operator's typed reading stays authoritative and rule 6 (OCR vs manual mismatch) simply never fires. Inventing plausible values would silently corrupt the fuel ledger. Acceptance criterion #15 is therefore *wired but not satisfied*. | Set `HK_OCR_DRIVER` to a real engine. Either wire Tesseract into `src/lib/ocr.ts` (the `parseGeneratorText()` regex extractor is already written and unit-testable) or route it through Phase 5's vision model via `readMeter()`. No call-site changes needed — the return shape is fixed. |
| D-18 | ~~Generator discrepancies do not auto-raise issues~~ | — | **Cleared 2026-08-03 (Phase 8).** Every discrepancy now raises an `HkAlert`: CRITICAL ones email the routed group immediately, lower severities are recorded in-app and ride the daily digest so a noisy rule cannot bury the inbox. Manual escalation into an `HkIssue` remains available on the resolve endpoint. | — |
| D-19 | **Efficiency score is not workload-normalised** | W | Scored from five measurable factors — SLA adherence, first-time-right, completion rate, evidence discipline, high-severity handling — with admin-tunable weights. Unmeasurable factors have their weight redistributed and the reason recorded, so a quiet period never reads as poor performance. | Brief §9 also wants normalisation by shift duration, area size and centre occupancy. That needs `HkStaff` rosters (item 1.13) — the same blocker as **D-06**. Do both together. |
| D-20 | **`ai-accuracy` and `ai-correction` reports return no rows** | B | Both are listed in the menu and return a valid empty table carrying an explanatory note, rather than being silently absent. | Phase 5. They populate once `AiPhotoFinding` records model output and user corrections. |
| D-21 | **No dedicated centre drill-down page** (8.6) | W | The management dashboard shows a per-centre rollup: areas, today's compliance, open/critical issues, generator discrepancies and running generators. | A `/housekeeping/centre/[id]` page with the latest photograph per area, next-inspection-due and the inspection route. Best built alongside Phase 5, when photos have AI summaries worth showing. |
| D-23 | **Rate limiting is per-instance and in-memory** | W | `rate-limit.ts` uses an in-process Map, matching the existing leads-capture approach. Honest limits: it resets on deploy and a multi-instance deployment gets N× the configured limit. Adequate as spam friction for a QR sticker on a wall. | Before opening these URLs to the public internet at scale, put a WAF or a Redis-backed limiter in front. The call sites need no change — only the internals of `rateLimit()`. |
| D-24 | **QR re-scan on completion is optional by default** | W | `requireQrOnComplete` defaults to **false**: a completion without a scan is allowed but recorded (`qrVerified: false`) and audited as `..._COMPLETED_WITHOUT_QR`. When a code *is* supplied it is strictly validated — a code from another area is rejected by name (verified). | Flip the setting to `true` once every area has its client sticker up. Left permissive so staff are not blocked before the stickers are physically deployed. |
| D-25 | **No AI verification of after-cleaning photos** (9.9) | B | Photos are captured, hashed and duplicate-checked (exact + perceptual), and the count is enforced per request type. | Phase 5's `compareBeforeAfter()`. Per the brief, the AI verdict must stay **advisory** — it may never auto-reject a valid staff completion without human review. |
| D-22 | **No supervisor personal-compliance view** (8.7) | W | `/housekeeping/tasks` covers assigned corrective work, and `/housekeeping/inspect` shows the active round. | A personal page combining rounds completed vs assigned, retakes required and personal compliance score. Small; deferred only because it overlaps two existing screens and is better designed once Phase 5 adds photo-rejection data. |

## Cleared

Rows stay in place above (struck through) and are listed here with the date and resolution —
the ledger keeps its history rather than deleting rows.

| # | Item | Cleared | How |
|---|---|---|---|
| D-11 | Rate limiting on public endpoints | 2026-08-03, Phase 9 | Per-IP + per-code buckets on all three public routes; allowlist scoped to exactly those paths. |
| D-13 | Printed QR points at a staff-only page | 2026-08-03, Phase 9 | Separate `ClientQrCode` set for clients; staff codes unchanged, nothing reprinted. |
| D-14 | Escalation recipients via env var | 2026-08-03, Phase 8 | Recipients now resolve through `EmailGroup`; env var kept as a fallback. |
| D-18 | Generator discrepancies do not auto-raise issues | 2026-08-03, Phase 8 | Discrepancies now raise an `HkAlert`; CRITICAL emails the routed group immediately, lower severities ride the daily digest. |

---

## How to use this after Phase 10

1. Re-read every row; some will have been resolved incidentally by a later phase.
2. Settle **D-01 → D-03** first — they are business decisions and may change what the
   remaining work looks like.
3. Then clear the `B` (blocked) rows, which should all be unblocked by then.
4. Finish with the `W` rows, which are quality improvements rather than gaps.
5. **D-09** (the manual acceptance-criteria pass) should be done **last**, as the final gate.
