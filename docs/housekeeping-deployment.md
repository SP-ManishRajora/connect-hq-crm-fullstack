# Deploying the Housekeeping Module to Live

Module-specific deployment steps. For the general app deploy flow see
[server-deployment.md](./server-deployment.md) — this document covers what is **new and
different** about the housekeeping module, and the things that will silently break if skipped.

Verified against this codebase on **2026-08-04** (**all phases shipped**).

---

## ⚠️ Read first — four things that are easy to get wrong

1. **Seven new environment variables.** Two of them (`HK_SIGNED_URL_SECRET`, `HK_CRON_SECRET`)
   have *silent* fallbacks — the app boots fine without them but behaves insecurely. See §2.
2. **Inspection photos are written outside the repo** (`private-uploads/`). That directory is
   gitignored, is **not** created by `git pull`, and is **not** backed up by a database dump.
   See §3 and §7.
3. **Seven cron jobs** must be registered or the module goes quiet — no escalations, no
   generator checks, no SLA breaches, no digests, no photo purge, no AI analysis. See §5.
4. **Two seed scripts** must be run once, in order. Without them there are no inspection areas,
   no QR codes and no request catalogue. See §4.

---

## 1. Deploy the code

Migrations are **additive** — all seven were checked for destructive statements: zero `DROP TABLE`,
zero `DROP COLUMN`, zero `TRUNCATE`. The only `ALTER`s relax `InspectionPhoto.visitId` to
nullable and add `purgedAt` columns; neither can lose data.

```bash
cd /var/www/coworking-erp
git pull origin main
npm install                 # qrcode + @types/qrcode are new
npx prisma migrate deploy   # applies 7 migrations, never resets
npx prisma generate
npm run build
pm2 restart coworking-erp
```

Confirm the migrations landed:

```bash
npx prisma migrate status   # expect "Database schema is up to date"
```

## 2. Environment variables

Add to the live `.env`. **None of these exist on your server yet.**

```bash
# ---- REQUIRED in production ----

# Signs photo URLs. Falls back to JWT_SECRET if unset — which works, but means
# rotating your session secret also invalidates every outstanding photo link.
# Generate: openssl rand -base64 32
HK_SIGNED_URL_SECRET=""

# Lets crontab call the cron endpoints without a session. If left EMPTY the cron
# routes fall back to requiring a logged-in manager, so unauthenticated crontab
# calls silently 401 and nothing ever runs.
# Generate: openssl rand -base64 32
HK_CRON_SECRET=""

# ---- RECOMMENDED ----

# Absolute path for inspection/generator/request photos. Defaults to
# <app>/private-uploads/housekeeping — put it on a volume you actually back up.
HK_UPLOAD_DIR="/var/lib/coworking-erp/hk-uploads"

# Fallback alert recipients, used until EmailGroups are configured in the UI.
# Falls back to active ADMIN/OWNER emails if empty.
HK_ESCALATION_EMAILS="facilities@yourcompany.com,management@yourcompany.com"

# ---- OPTIONAL ----

HK_STORAGE_DRIVER="local"   # only "local" is implemented (MinIO/S3 = D-15)
HK_OCR_DRIVER="stub"        # "stub" returns no reading; see D-17

# ---- AI vision (Phase 5) ----
# Ships as "stub": photographs are stored and queued but not analysed. The stub's
# findings carry 0.05 confidence so they can never auto-create issues.
# To enable real analysis you need ~10 GB disk (ideally a GPU):
#   ollama pull llava:7b   →   HK_AI_DRIVER="ollama"
# Or use a hosted endpoint — but note photographs then leave your infrastructure.
HK_AI_DRIVER="stub"
HK_AI_BASE_URL=""
HK_AI_MODEL=""
HK_AI_API_KEY=""
HK_AI_TIMEOUT_MS="120000"
HK_PUBLIC_SECRET=""         # extra guard on the public endpoint; same-origin always passes
```

Also confirm `APP_URL` is your real HTTPS origin — it builds the QR code URLs and every deep
link in alert emails. A wrong value produces printed QR codes that point at the wrong host.

## 3. Photo storage directory

```bash
sudo mkdir -p /var/lib/coworking-erp/hk-uploads
sudo chown -R <app-user>:<app-user> /var/lib/coworking-erp/hk-uploads
sudo chmod 750 /var/lib/coworking-erp/hk-uploads
```

**Never place this under `public/`.** Photos there would be readable by anyone who guesses a
URL. The module serves them exclusively through HMAC-signed, session- and centre-checked routes.

Sizing: roughly 4 photos × ~20 areas × 1 round/day ≈ **80 photos/day/centre**. At ~2 MB each
that is ~160 MB/day/centre, ~5 GB/month for three centres. The 180-day retention job (§5)
settles this at roughly **30 GB steady-state**.

## 4. Seed data — run once, in order

```bash
npm run db:seed:hk    # inspection areas + staff QR codes
npm run db:seed:cr    # request catalogue + client QR codes
```

Both are **idempotent** — safe to re-run; they skip anything that already exists.

`db:seed:hk` creates, per active centre: 8 bathrooms, 5 common areas, parking, front, back,
guard room, electricity room, generator area and fuel tank (20 areas), each with a staff QR.
`db:seed:cr` creates 28 request types (16 services + 8 consumables + 4 report actions) and one
**client** QR per area.

Quantities are data, not code — edit them freely at `/housekeeping/setup` afterwards.

## 5. Cron jobs

Nothing time-based happens without these. Replace `<secret>` with `HK_CRON_SECRET` and
`<host>` with your domain.

```cron
# Overdue corrective actions → escalation email
*/30 * * * * curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/escalations > /dev/null

# Generator: missed 30-min photo + still-running-too-long
*/15 * * * * curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/generator-checks > /dev/null

# Client request SLA breaches + auto-close unconfirmed completions
*/5  * * * * curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/request-sla > /dev/null

# Daily management summary (7pm)
0 19 * * *   curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/daily-summary > /dev/null

# Weekly summary (Friday 6pm)
0 18 * * 5   curl -fsS -X POST -H "x-cron-secret: <secret>" "https://<host>/api/housekeeping/cron/daily-summary?period=weekly" > /dev/null

# Photo retention purge — 180 days (Sunday 3am, off-peak)
0 3 * * 0    curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/retention > /dev/null

# AI analysis queue — only useful once HK_AI_DRIVER is not "stub"
*/2 * * * *  curl -fsS -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/ai > /dev/null
```

Preview the purge before trusting the schedule — it deletes files:

```bash
curl -X POST -H "x-cron-secret: <secret>" "https://<host>/api/housekeeping/cron/retention?dry=1"
# reports what WOULD be deleted; touches nothing
```

Verify one manually before trusting the schedule:

```bash
curl -X POST -H "x-cron-secret: <secret>" https://<host>/api/housekeeping/cron/escalations
# expect {"escalated":0,"notified":0} — NOT a 401
```

A **401 means `HK_CRON_SECRET` is not set** (or differs between the app and the crontab).

## 6. Post-deploy configuration (in the UI)

1. **Assign users to centres.** Anyone without a `centerId` sees an empty module.
2. **Capture GPS per area** — `/housekeeping/setup`, stand in each area, tap **Set GPS**. Until
   then scans are recorded but flagged `GEOFENCE_UNVERIFIED` rather than geofenced.
3. **Print and mount both QR sheets** — `/housekeeping/setup/qr-sheet` (staff) and
   `/housekeeping/setup/client-qr-sheet` (clients). These are **different codes**; do not swap
   them.
4. **Create email groups** — `POST /api/housekeeping/email-groups` (no admin form yet, D-33).
   Until then alerts fall back to `HK_ESCALATION_EMAILS`, then to admin/owner emails.
5. **Review the settings** — `/housekeeping/setup/config` covers every tunable in one page.
6. **Add generators** — `/housekeeping/generator` → **+ Generator**. Set tank capacity and
   normal L/h, or the consumption rule cannot fire.
7. **Confirm SMTP works** — without it, `sendMail()` logs to console instead of sending and
   every alert is recorded as delivered-but-unsent.
8. **Review devices** — `/housekeeping/setup/security` lists every phone that has scanned.
   Revoking one blocks it immediately at both scan and photo upload.

## 7. Backups

A database dump is **not sufficient** — inspection evidence lives on disk.

```bash
# database
mysqldump -u <user> -p <db> | gzip > backup-$(date +%F).sql.gz

# photo evidence — MUST be backed up separately
tar czf hk-uploads-$(date +%F).tar.gz -C /var/lib/coworking-erp hk-uploads
```

Restoring the database without the photo directory leaves every issue and inspection pointing
at missing files.

## 8. Recommended settings to review

All live in the `HkSetting` table (no admin form yet — D-08), tunable via the API or directly:

| Key | Watch out for |
|---|---|
| `inspection.config` | `rejectOutsideGeofence` defaults **false** (flags, doesn't block). Turn on only after GPS is captured for every area. |
| `issues.config` | SLA hours: CRITICAL 2 / HIGH 8 / MEDIUM 24 / LOW 72. |
| `generator.config` | Fuel tolerance 5 L, backdate tolerance 15 min — tune to your gauges. |
| `requests.config` | `requireQrOnComplete` defaults **false** so staff aren't blocked before client stickers are mounted. **Turn it on once they are** (D-24). |
| `retention.config` | **180 days** (decided 2026-08-04). Only image files are purged — records, hashes, findings and audit rows are kept permanently, and a purged photo serves 410 with an explanation. `dryRun` and `maxDeletesPerRun` are available as safety valves. |

## 9. Smoke test on live

```bash
# public client screen (no login) — use a real client QR code
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/qr/a/<client-code>     # 200

# protected route without a session
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/housekeeping/issues # 307 → login

# rate limiting is live (10th rapid submit should 429)
```

Then run the automated checks on the server:

```bash
npm test            # 134 unit tests over the business rules (no DB needed)
npm run hk:verify   # 22 criteria against live schema + data; non-zero exit on regression
```

Finally, logged in: open `/housekeeping`, run one inspection round end to end on a phone, and
confirm a photo renders (proves signed URLs and `HK_UPLOAD_DIR` permissions are correct).

## 10. Rollback

```bash
git revert <merge-commit> && npm run build && pm2 restart coworking-erp
```

The schema can stay — the new tables are additive and unused by older code. Do **not** roll the
database back to drop them; you would lose inspection evidence for no benefit.

---

## Known limitations at deploy time

| Item | Impact |
|---|---|
| **AI ships on the stub** (D-31) | Photos are stored, queued and consolidated, but not analysed until a model is configured. Enabling one is an env-var change. |
| **OCR is a stub** (D-17) | Generator readings are operator-typed; the OCR-mismatch rule never fires. |
| **Rate limiting is in-memory** (D-23) | Per-instance, resets on deploy. Put a WAF in front for real public exposure. |
| **Email groups have no form** (D-33) | Created via the API; every other setting has a UI at `/housekeeping/setup/config`. |

Full list: [housekeeping-deferred.md](./housekeeping-deferred.md).
