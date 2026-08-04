# Housekeeping — Administrator Manual

For ADMIN and OWNER users. Day-to-day operation is in the
[user manual](./housekeeping-user-manual.md); deployment is in the
[deployment guide](./housekeeping-deployment.md).

---

## Contents

1. [First-time setup](#1-first-time-setup)
2. [Managing inspection areas](#2-managing-inspection-areas)
3. [QR codes — two different sets](#3-qr-codes--two-different-sets)
4. [Who can see what](#4-who-can-see-what-rbac)
5. [Tuning the rules](#5-tuning-the-rules)
6. [Devices and retention](#6-devices-and-retention)
7. [Alerts and email groups](#7-alerts-and-email-groups)
8. [Reports](#8-reports)
9. [AI vision analysis](#8a-ai-vision-analysis)
10. [Troubleshooting](#9-troubleshooting)

---

## 1. First-time setup

In order:

1. **Assign every user to a centre.** A user with no centre sees an empty module.
2. **Seed the areas** — `npm run db:seed:hk` creates 20 standard areas per centre with a staff
   QR each. `npm run db:seed:cr` creates the request catalogue and client QR codes. Both are
   safe to re-run.
3. **Capture GPS for each area** — walk to it, open **Housekeeping → HK Setup / QR** on a phone,
   tap **Set GPS**. Until an area has a point, scans there are recorded but marked *unverified*.
4. **Print and mount both QR sheets** (see §3).
5. **Add generators** — Housekeeping → Generator → **+ Generator**. Set the tank capacity and
   the normal litres-per-hour, or the consumption rule cannot fire.
6. **Create email groups** (see §7) so alerts reach the right people.

Verify everything at once:

```bash
npm run hk:verify    # checks all 22 acceptance criteria against live data
```

---

## 2. Managing inspection areas

**Housekeeping → HK Setup / QR**

The seeded quantities (8 bathrooms, 5 common areas…) are only a starting point — add, rename,
pause or remove areas freely.

| Action | Effect |
|---|---|
| **Set GPS** | Saves your current position as the area's reference point. Stand in the area. |
| **New QR** | Issues a fresh code. **The old printout stops working** — reprint that row. |
| **Pause** | Excluded from new rounds; history is kept. |
| **Remove** | Soft delete. Past inspections keep pointing at it. |

Per-area settings worth reviewing: **photo count** (default 4), **minimum time** (90 s for
bathrooms, 60 s elsewhere), **geofence radius** (default 50 m — see §5).

---

## 3. QR codes — two different sets

This trips people up, so it is worth being explicit.

| Sheet | Who scans it | Where it leads |
|---|---|---|
| **Staff QR sheet** | Supervisors | The inspection flow (login required) |
| **Client QR sheet** | Members and guests | The public request screen (no login) |

They are **different codes for the same area** and must not be swapped. The client sheet is
styled differently ("Need something cleaned?") to make them distinguishable on a wall.

Print both from **HK Setup / QR**. Use the per-row **Print** action to reprint a single area
after rotating its code.

---

## 4. Who can see what (RBAC)

The brief's seven personas map onto your existing roles — no separate role system was added.

| Module key | Grants access to | Roles |
|---|---|---|
| `housekeeping` | Dashboard, alerts, API reference | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_inspect` | Run inspection rounds | ADMIN, OWNER, OPS, CENTER_MANAGER |
| `hk_issues` | Issues and My Tasks | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_requests` | Cleaning requests console | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_generator` | Generator monitoring | ADMIN, OWNER, MANAGER, OPS |
| `hk_reports` | Reports | ADMIN, OWNER, MANAGER, CENTER_MANAGER |
| `hk_admin` | Setup, QR, devices, retention | ADMIN, OWNER |

**Centre scoping is automatic.** ADMIN and OWNER see every centre; everyone else sees only
their own — including in reports, photographs and alerts.

To give one person an exception, set `allowedModules` on their user record (a JSON array of
module keys). That overrides their role's defaults entirely.

---

## 5. Tuning the rules

All of it is editable at **HK Setup → ⚙️ Settings** (`/housekeeping/setup/config`). Devices and
retention also have their own screen at **HK Setup → 🔐 Security**. Every change is written to
the audit log with its before and after value.

The AI and OCR **drivers** are environment variables rather than settings — the page shows
which one is running, but changing it means editing `.env` and restarting.

| Key | Controls | Default |
|---|---|---|
| `inspection.config` | Geofence rejection, GPS accuracy, travel speed, rescan gap, gallery permission | reject **off**, 50 m, 80 km/h |
| `issues.config` | SLA hours per severity, after-photo requirement | 2 / 8 / 24 / 72 h |
| `generator.config` | Fuel and hour tolerances, backdating window, consumption factor | 5 L, 0.1 h, 15 min, 1.5× |
| `requests.config` | Auto-assign, client confirmation, QR-on-complete | auto-assign **on** |
| `efficiency.config` | Scoring weights | 30/25/20/15/10 |
| `retention.config` | Photo retention days, dry run, per-run cap | **180 days** |
| `ai.config` | Auto-queue, auto-issue thresholds, retries, prompt overrides | HIGH @ 0.7 confidence |

### Two settings to revisit once you are live

**`rejectOutsideGeofence`** is **off** — out-of-radius scans are flagged, not blocked. Turn it
on only after every area has a GPS point, or staff will be locked out of areas you never
configured.

**`requireQrOnComplete`** is **off** — staff can complete a cleaning request without re-scanning.
Turn it on once the client stickers are physically mounted.

---

## 6. Devices and retention

**Housekeeping → HK Setup / QR → 🔐 Security**

### Devices
Every phone that scans is registered automatically, with its owner and scan count.

**Revoking blocks that device immediately** — it can no longer scan or upload photographs. Use
it when a phone is lost or reassigned. Revocation is reversible and both directions are audited.

> A device identifier is stored in the browser and can be cleared by the user, so this stops
> casual reuse of a lost phone, not a determined actor. It is one signal among several — GPS,
> server time, dwell time and photo hashing all apply independently.

### Photo retention
Photographs are deleted after **180 days**. Everything else — records, hashes, AI findings,
scores, the audit trail — is kept permanently. A purged photo shows as *"removed under the
retention policy"* rather than a broken image.

**Always preview first.** Tap **Preview what would be deleted** before purging; it reports the
count without touching disk. The scheduled job runs weekly, so manual purging is rarely needed.

---

## 7. Alerts and email groups

Alerts route by type: generator discrepancies go to Security/Facility/Management, critical
issues to Facility/Management, and so on.

Recipients resolve in this order — **centre-specific group → global group of the right kind →
`HK_ESCALATION_EMAILS` → active ADMIN/OWNER emails**. An alert always reaches someone.

Create groups via `POST /api/housekeeping/email-groups` with `name`, `kind`
(`MANAGEMENT` / `FACILITY` / `ACCOUNTS` / `SECURITY` / `CENTRE`), `toEmails` and `ccEmails`.

**Only CRITICAL alerts send email immediately.** Lower severities are recorded in-app and
summarised in the daily digest — otherwise twelve generator rules would bury the inbox and
everyone would mute it.

Check delivery at **Housekeeping → Alerts**: every alert shows whether its email was sent,
failed or skipped. If everything says *skipped*, SMTP is not configured.

---

## 8. Reports

**Housekeeping → HK Reports** — 18 reports, each exportable as CSV, Excel or print-to-PDF.

Two of them (**AI analysis accuracy**, **AI corrections**) still return no rows — the underlying
data is now recorded on every finding, but the two report builders have not been wired to it yet
(tracked as D-32). They are listed so the menu matches the specification.

**Staff efficiency** deserves a note: it scores *how work was handled* — SLA adherence,
first-time-right, completion, evidence, severity handling — and deliberately **never scores
people on how many issues were reported**. A quiet period is not treated as poor performance;
unmeasurable factors have their weight redistributed and the reason is recorded.

---

## 8a. AI vision analysis

**It ships switched off.** `HK_AI_DRIVER=stub` means photographs are stored, queued and
consolidated, but not analysed. The stub is deliberately inert — its findings carry 0.05
confidence, far below the 0.7 auto-issue threshold, so it can never create work orders for
problems nobody has seen.

**To enable a local model** (photographs stay on your infrastructure — recommended):

```bash
ollama pull llava:7b          # ~4.7 GB; needs ~10 GB free disk, ideally a GPU
# then in .env:
HK_AI_DRIVER="ollama"
HK_AI_BASE_URL="http://localhost:11434"
HK_AI_MODEL="llava:7b"
```

Expect **30–60 s per photograph on CPU**. That is exactly why analysis runs off a queue — a
slow model never delays an inspection.

**Or a hosted endpoint:** set `HK_AI_DRIVER="openai-compatible"` with `HK_AI_API_KEY`. Faster
and more accurate, but **photographs leave your infrastructure** — the original brief wanted to
avoid that, so choose deliberately.

**Check it is working:** `GET /api/housekeeping/ai/health` reports driver reachability and queue
depth. Register the `cron/ai` job (§5 of the deployment guide) or nothing will ever be analysed.

**Auto-created issues.** A finding at or above `autoIssueMinSeverity` (default HIGH) **and**
above `autoIssueMinConfidence` (0.7) becomes a real issue automatically, tagged `source: AI`.
Lower the confidence and you will get noise; raise the severity and hazards may sit unassigned.
Watch the first week of findings before changing either.

**Corrections are kept.** Every accept/correct/reject a supervisor makes is stored alongside
the model's original output, so you can measure how often the model is right before trusting it
further.

## 8b. Screens for day-to-day supervision

| Screen | For |
|---|---|
| `/housekeeping` | Cross-centre management view — facility score, trends, alerts, staff ranking |
| `/housekeeping/centre/[id]` | One centre in depth: every area with its latest photograph, last and next inspection, score, open issues and live generator status. Reached by clicking a centre name on the dashboard. |
| `/housekeeping/me` | A supervisor's own record — rounds, clean-scan rate, flags raised against them, and how their efficiency score was built |

## 9. Troubleshooting

**Nothing happens on schedule.** The cron jobs are not registered, or `HK_CRON_SECRET` differs
between the app and crontab. Test:
```bash
curl -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/escalations
```
A **401** means the secret is wrong or unset. See the deployment guide §5.

**Photographs will not upload.** Check `HK_UPLOAD_DIR` exists and the app user can write to it.
Uploads fail at runtime if the directory is missing — it is not created by `git pull`.

**A photo shows "removed under the retention policy".** Expected after 180 days. The record and
its findings remain; only the image was deleted.

**A user sees an empty module.** They have no `centerId`. Assign them to a centre.

**Alerts are logged but never arrive.** SMTP is not configured, so `sendMail()` writes to the
console. Check `SMTP_HOST` in `.env`.

**Someone completed a cleaning request without scanning.** That is allowed by default and
recorded as `qrVerified: false`, audited separately. Turn on `requireQrOnComplete` to enforce it.

**AI findings never appear.** Either `HK_AI_DRIVER` is still `stub`, or the `cron/ai` job is not
registered. Check `GET /api/housekeeping/ai/health` — it reports both the driver and the queue
depth. A growing `pending` count with `done: 0` means the cron is not running.

**Checking whether anything regressed:**
```bash
npm test          # 134 unit tests over the business rules
npm run hk:verify # 22 acceptance criteria against live data
```
