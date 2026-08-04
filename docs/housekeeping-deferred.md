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

Last updated: **2026-08-04** (after Phase 5 — all phases now built).

---

## Open — needs a decision from the business

| # | Item | Type | Why it matters | Blocks |
|---|---|---|---|---|
| D-01 | **Confirm role mapping** (module doc §4). Supervisor, Housekeeping Manager and Security all currently map to the existing `OPS` role. | Q | If these need genuine separation, assignment rules, efficiency scoring and generator permissions all change. Cheaper to settle before Phases 7–8 build on top of the current mapping. Suggested fix if separation is needed: add `HkStaff.staffRole` as the discriminator rather than new ERP roles — `MODULE_ACCESS` already supports per-user overrides. | 7, 8 |
| D-02 | ~~Photo retention period~~ | — | **Cleared 2026-08-04 (Phase 10).** Set to **180 days** by the user. Only the image FILE is deleted; rows, hashes, AI findings, scores and the audit trail are kept permanently, and a purged photo serves `410 Gone` with an explanation rather than a broken image. | — |
| D-03 | **Geofence default radius.** Currently hard-defaulted to **50 m** per location in the schema; never confirmed. | Q/W | 50 m is generous for indoor areas in one building — it may not distinguish "in the bathroom" from "in the corridor". Needs a real-world check once GPS points are captured. | — |

## Deferred inside completed phases

| # | Item | Phase | Type | What ships today | What's still missing |
|---|---|---|---|---|---|
| D-04 | ~~AI auto-creation of issues~~ (6.1) | 6 | — | **Cleared 2026-08-04 (Phase 5).** Findings at or above `autoIssueMinSeverity` (default HIGH) **and** above `autoIssueMinConfidence` (0.7) are promoted through the same `createIssue()` path, tagged `source: AI` and audited as `HK_ISSUE_RAISED_BY_AI`. Duplicate open issues for the same fault in the same area are linked, not re-created. | — |
| D-05 | ~~After-photo AI analysis & before/after comparison~~ (6.4) | 6 | — | **Cleared 2026-08-04 (Phase 5).** `compareBeforeAfter()` sends both photographs to the driver and returns a completion verdict, post-score, remaining issues and confidence. Advisory only — per brief §29 it may never auto-reject a valid staff completion. | — |
| D-06 | **Auto-assignment by shift / availability / workload** (6.2) | 6 | W | Manual assignee pick, plus an optional per-centre default assignee in `HkSetting`. | Needs `HkStaff` + `HkStaffAssignment` (item 1.13) for shift and workload data. Planned with Phase 8 efficiency scoring. |
| D-07 | ~~Round summary + `AreaSummary` generation~~ (4.9) | 4 | — | **Cleared 2026-08-04 (Phase 5).** `consolidateArea()` merges every finding across a visit into one summary — deduped across angles, worst-severity wins, weighted scores, and diffed against the previous visit for new/resolved/repeat issues plus a trend. | — |
| D-08 | ~~Settings UI~~ (2.4) | 2 | — | **Cleared 2026-08-04.** `/housekeeping/setup/config` edits all 7 config groups — inspection, issues, generator, requests, efficiency, retention and AI — with every change written to the audit log before→after. Driver selection stays an env var and is shown read-only. Email-group management remains API-only (**D-33**). | — |
| D-09 | ~~Manual acceptance-criteria pass~~ (10.10) | 10 | — | **Cleared 2026-08-04 (Phase 10).** Automated as `npm run hk:verify` — checks all 22 criteria against the live schema, data and routes rather than a hand-ticked list, and exits non-zero on a regression. Current: 17 pass · 2 partial · 3 deferred · **0 fail**. | — |
| D-10 | ~~Device registration & revocation UI~~ (10.6) | 10 | — | **Cleared 2026-08-04 (Phase 10).** `/housekeeping/setup/security` lists every device with its owner and scan count. Revoking **blocks** that device at both scan and photo upload (verified 403), is scoped to the one device, is reversible, and is audited both ways. `touchDevice()` never clears `revokedAt`, so re-registering cannot undo a revocation. | — |
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
| D-20 | ~~`ai-accuracy` and `ai-correction` reports return no rows~~ | — | **Cleared 2026-08-04 (Phase 5).** `AiPhotoFinding` now records both the model's output and every human verdict, so accuracy and correction rates are computable. *The report builders still need updating to query it — tracked as **D-32**.* | — |
| D-21 | ~~No dedicated centre drill-down page~~ (8.6) | 8 | — | **Cleared 2026-08-04.** `/housekeeping/centre/[id]` shows every area with its latest photograph, last and next inspection, area score, open issues and live generator status. Linked from each centre row on the management dashboard. | — |
| D-23 | **Rate limiting is per-instance and in-memory** | W | `rate-limit.ts` uses an in-process Map, matching the existing leads-capture approach. Honest limits: it resets on deploy and a multi-instance deployment gets N× the configured limit. Adequate as spam friction for a QR sticker on a wall. | Before opening these URLs to the public internet at scale, put a WAF or a Redis-backed limiter in front. The call sites need no change — only the internals of `rateLimit()`. |
| D-24 | **QR re-scan on completion is optional by default** | W | `requireQrOnComplete` defaults to **false**: a completion without a scan is allowed but recorded (`qrVerified: false`) and audited as `..._COMPLETED_WITHOUT_QR`. When a code *is* supplied it is strictly validated — a code from another area is rejected by name (verified). | Flip the setting to `true` once every area has its client sticker up. Left permissive so staff are not blocked before the stickers are physically deployed. |
| D-25 | ~~No AI verification of after-cleaning photos~~ (9.9) | 9 | — | **Cleared 2026-08-04.** `verifyRequestCompletion()` compares the client's before photograph (when supplied) with the staff after photograph. Advisory only — the verdict is logged and returned but never reverses a completion, per brief §29. Per-type photo counts are now enforced too. | — |
| D-22 | ~~No supervisor personal-compliance view~~ (8.7) | 8 | — | **Cleared 2026-08-04.** `/housekeeping/me` shows rounds run, areas submitted, clean-scan rate, which flags were raised against your scans, work still assigned to you, and a full breakdown of how your efficiency score was calculated. | — |

## Declined for now — with the trigger that would justify revisiting

These are **not** unfinished work. Each was assessed in Phase 11 and deliberately not built,
because the cost is real and the benefit is currently theoretical. Each row names the concrete
signal that would change that judgement.

| # | Item | Why not now | Revisit when |
|---|---|---|---|
| D-26 | **Offline mode** (11.1) | The single most complex item in the brief — service worker, IndexedDB queue, encrypted local store, and conflict resolution between a device clock and server time. It is only worth that complexity if inspections genuinely fail today. Every centre so far has usable coverage. | A supervisor reports an area where scans actually fail. Then build it for that centre's dead spots specifically, rather than speculatively for all. |
| D-27 | **Hindi/English i18n** (11.3) | No i18n library is installed, and retrofitting one touches every one of the 16 screens. The current users all work in English. Half-translating is worse than not translating — a screen that mixes languages is harder to use than one that does not. | Housekeeping staff who are not comfortable in English join, or a centre opens where they are the majority. Start with the inspect/tasks flows, which are the only screens non-office staff use. |
| D-28 | **MinIO / S3 storage driver** (11.4) | Local disk works, is backed up by the documented `tar` step, and the 180-day retention job caps growth at roughly 30 GB. `HK_STORAGE_DRIVER` and the narrow `storage.ts` interface already exist, so this stays a driver swap rather than a rewrite. | Photo storage outgrows the server's disk, a second app instance is added (local disk stops being shared), or a compliance rule requires object-store durability. |
| D-33 | **Email groups have no admin form** | W | Groups are created and listed via `POST/GET /api/housekeeping/email-groups`; routing, fallbacks and delivery logging all work. The new settings page covers every other config group. | Add a small CRUD panel to `/housekeeping/setup/config`. Low urgency: groups are set up once and rarely change, and the fallback chain means alerts are never undeliverable. |
| D-30 | **Push notifications** (part of 11.2) | The manifest and install path ship, so the app installs to a home screen. Web Push additionally needs VAPID key generation, a service worker, a subscription store, and a decision about which events are worth interrupting someone for — a different problem from "make it installable". Alerts already reach people by email and in-app. | Staff report missing urgent requests because they were not looking at the app. Start with URGENT cleaning requests and CRITICAL issues only; anything more becomes noise and gets muted. |
| D-31 | **No vision model is installed** | Q/W | All three drivers ship and the pipeline is proven end to end, but `HK_AI_DRIVER=stub` is the default because this machine has **no GPU, 4.8 GB free RAM and 2 GB free disk** — `llava:7b` needs ~4.7 GB and `moondream` ~1.7 GB. The stub is deliberately inert: confidence 0.05, far below the 0.7 auto-issue threshold, so it can never manufacture work orders. | Provision a host with ~10 GB disk and ideally a GPU, then `ollama pull llava:7b` and set `HK_AI_DRIVER=ollama`. No code changes. Expect ~30–60 s per photograph on CPU, which is why analysis is queued. Alternatively set `HK_AI_DRIVER=openai-compatible` with an API key — faster and more accurate, but photographs then leave your infrastructure. |
| D-32 | ~~AI accuracy/correction reports not wired~~ | — | **Cleared 2026-08-04.** Both reports now query `AiPhotoFinding`: accuracy shows accepted/corrected/rejected per model with an accuracy percentage over **reviewed findings only** (so it cannot be inflated by unreviewed ones), plus a count of issues the model missed entirely. The correction report lists what the model said versus what the supervisor said. | — |
| D-29 | **Docker / Docker Compose** (11.6) | This would change the deployment model for the **entire ERP**, not just this module. The app runs on PM2 today and deploys with a documented `git pull` + build. Containerising to satisfy a checklist item is a large, risky change with no benefit to current operations. | The team moves to container orchestration for the whole ERP, or Phase 5 introduces a local AI model that genuinely needs its own container alongside the app. |

## Cleared

Rows stay in place above (struck through) and are listed here with the date and resolution —
the ledger keeps its history rather than deleting rows.

| # | Item | Cleared | How |
|---|---|---|---|
| D-02 | Photo retention period undecided | 2026-08-04, Phase 10 | Set to 180 days; purge deletes files only, keeps every record. |
| D-09 | Manual acceptance-criteria pass | 2026-08-04, Phase 10 | Automated as `npm run hk:verify`; 0 failures. |
| D-10 | Device revocation not enforced | 2026-08-04, Phase 10 | Revoked devices are now blocked at scan and upload, with an admin UI. |
| D-08 | Settings UI | 2026-08-04 | All 7 config groups editable at `/housekeeping/setup/config`. |
| D-21 | Centre drill-down page | 2026-08-04 | `/housekeeping/centre/[id]` with latest photo per area. |
| D-22 | Supervisor compliance view | 2026-08-04 | `/housekeeping/me` with flags and score breakdown. |
| D-25 | AI verification of after-photos | 2026-08-04 | `verifyRequestCompletion()`, advisory only. |
| D-32 | AI reports not wired to data | 2026-08-04 | Both now query `AiPhotoFinding`. |
| D-04 | AI auto-creation of issues | 2026-08-04, Phase 5 | Findings above the severity + confidence thresholds now create issues via `createIssue()`. |
| D-05 | After-photo AI comparison | 2026-08-04, Phase 5 | `compareBeforeAfter()` implemented; advisory only. |
| D-07 | `AreaSummary` generation | 2026-08-04, Phase 5 | `consolidateArea()` merges findings and diffs the previous visit. |
| D-20 | AI reports return no rows | 2026-08-04, Phase 5 | Data now recorded; builders tracked as D-32. |
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
