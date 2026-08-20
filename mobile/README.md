# ConnectHQ Housekeeping — Android staff app

An Expo / React Native app for housekeeping staff. It talks to the existing
housekeeping API in this repo; almost every endpoint it calls was already there
for the web module.

- **API base:** `https://crm.connecthq.co.in` (override with `EXPO_PUBLIC_API_BASE_URL`)
- **Package:** `in.connecthq.housekeeping`
- **Distribution:** direct APK (EAS `preview` profile)

---

## Before the app can be used

The server changes it depends on **must be deployed first**. As of 2026-08-20
production was still serving an older build — `/api/auth/mobile/login` returned
`307 → /login`, so sign-in cannot work until you deploy.

Deploy checklist on the server:

```bash
git pull
npm install
npx prisma migrate deploy     # applies 20260820100000_mobile_app_auth_and_offline_sync
npm run build
pm2 restart coworking-erp
```

Verify it took:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://crm.connecthq.co.in/api/auth/mobile/login \
  -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}'
# 401 = deployed (credentials rejected, endpoint reached)
# 307 = not deployed yet
```

> **One behaviour change to be aware of.** Unauthenticated `/api/*` requests now
> return `401 {"error":"unauthorized"}` instead of redirecting to `/login`. This
> is required — an app that follows a redirect gets an HTML page with status 200
> and can never tell an expired session from a success. No existing web code
> depended on the redirect, but it is a change to shared middleware.

---

## Development

```bash
cd mobile
npm install
npm start            # Expo dev server
npm run typecheck
```

Pointing at a local server: an Android emulator cannot reach your machine on
`localhost`. Use `10.0.2.2`, which the `development` EAS profile already sets:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000 npm start
```

The login screen shows the host it will use, and warns visibly when that host is
plain HTTP.

## Building the APK

```bash
npm install -g eas-cli
eas login
eas build:configure          # sets a real projectId in app.json
eas build --platform android --profile preview
```

`preview` produces an installable APK rather than an AAB. Staff install it
directly; there is no Play Store listing.

> `app.json` currently carries a placeholder `extra.eas.projectId`. `eas
> build:configure` replaces it. Push notifications need the real value — the
> token request is scoped to the EAS project.

---

## What works offline

Everything in the inspection flow. Scans, photographs and submissions are written
to a local SQLite outbox **first** and uploaded later — the same code path online
and offline, so the offline case is exercised on every inspection rather than
only in dead spots.

| Workflow | Offline |
|---|---|
| Inspection rounds — scan, photos, submit | **Yes**, fully. Opening a *new* round needs signal (the round id comes from the server) |
| My Tasks — start, complete | **Yes** — actions queue. The list itself needs signal |
| Cleaning requests — accept, on my way, start | **Yes** — actions queue. The list needs signal |
| Generator readings | **No, by design** — see below |

**Why generator readings are online-only.** Each one is multipart with a
mandatory gauge photograph, and the server evaluates twelve discrepancy rules
against the previous reading *at the moment it lands*. Queuing them would mean a
batch arriving out of order hours later and firing false discrepancies at
whoever synced last. The screen says so plainly rather than accepting work the
server will then mis-judge.

### How offline evidence is treated

Offline capture breaks the guarantee the module was built on: `POST
/api/housekeeping/visits` states that server time is authoritative and
`scannedAt` is never taken from the client. Rather than weakening that for
everyone, offline visits go to a separate endpoint (`POST
/api/housekeeping/sync`) and are stored as a visibly weaker class of evidence:

- `capturedAt` — what the device claimed. Recorded, never trusted.
- `scannedAt` — still real server time; here it means *when it synced*.
- `offlineCaptured = true` and the `OFFLINE_CAPTURED` flag, so reports, the
  supervisor view and the audit log all show that server time was not witnessed.
- The audit entry records `delayMinutes` — how far the claim was from arrival.

Everything else still applies unchanged: geofence, device revocation, QR
resolution, centre ownership, round ownership. Offline relaxes the clock and
nothing else.

Sync is idempotent on an app-generated `clientVisitId`, so a retried batch cannot
duplicate work. Each item gets its own verdict — one bad item never sinks a
batch — and anything the server refuses is kept and surfaced on the **Queue**
screen for a person to deal with, never silently dropped.

---

## Layout

```
App.tsx                  tab shell; tabs filter by the account's modules
src/api/client.ts        fetch + transparent token refresh (single-flight)
src/api/auth.ts          SecureStore credentials, stable device id
src/api/sync.ts          the outbox drain: visits → photos → actions
src/api/housekeeping.ts  typed endpoint bindings
src/db/outbox.ts         SQLite queue; photo bytes stay as files, not blobs
src/lib/session.tsx      session context
src/lib/push.ts          Expo push registration (urgent channel only)
src/screens/             one per workflow, plus the queue
```

## Notes worth knowing

**Token refresh is single-flight.** Refresh tokens rotate single-use on the
server, so four parallel requests on a stale token would spend four refresh
tokens and three would be rejected. One refresh runs at a time and every caller
shares it.

**The device id survives sign-out.** It identifies the handset, not the person —
rotating it on logout would defeat admin device revocation, which is keyed on a
stable id. As with the web app's localStorage id, a reinstall produces a new one,
so this stops casual reuse of a lost phone, not a determined actor.

**Push is deliberately narrow** — URGENT cleaning requests and CRITICAL issues
assigned to you, and nothing else (`docs/housekeeping-deferred.md`, D-30).
Notifying on every assignment is what gets an app muted, after which the urgent
ones are missed too. Email and in-app alerts are unchanged and remain the system
of record.

**Completing a cleaning request is not offered in the app.** The server may
require a QR re-scan and an after-photograph, and a button the server then
refuses teaches staff the app is unreliable.

**No navigation library.** Five flat screens, no stack, no deep links — a
library would add dependencies and a native build step to replace ~15 lines of
state. Add one when nested routing is genuinely needed.
