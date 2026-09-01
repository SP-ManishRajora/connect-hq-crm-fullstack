# ConnectHQ Housekeeping — Android app

**File:** `ConnectHQ-Housekeeping-v1.0.1.apk` (91 MB)
**Server:** https://crm.connecthq.co.in

For housekeeping supervisors and staff. Runs inspection rounds, corrective
actions, cleaning requests and generator readings from a phone.

---

## Installing

The app is distributed as an APK rather than through the Play Store, so Android
will ask for permission the first time.

1. Copy the APK to the phone (USB, Drive, WhatsApp — anything).
2. Open it from the Files app or the notification.
3. Android will warn about installing from an unknown source. Tap
   **Settings → Allow from this source**, then go back and tap **Install**.
4. Open **ConnectHQ Housekeeping** and sign in with your normal ERP email and
   password.

Updating later is the same steps — installing over the top keeps you signed in
and keeps anything still waiting to upload.

**Requires Android 6.0 or newer.**

## Permissions, and why

| Permission | Why it is needed |
|---|---|
| Camera | Scanning area QR codes and taking the inspection photographs |
| Location | Confirming you were at the area you inspected |
| Notifications | Urgent cleaning requests and critical issues assigned to you |

Photographs must be taken through the app's camera. The gallery is deliberately
not an option — a photograph of a photograph proves nothing.

## Working without signal

Only two things need a connection: **signing in** and **starting a round**.
Everything after that — scanning, photographing, submitting areas, completing
tasks — is saved on the phone first and uploads on its own when signal returns.

The bar at the top of every screen tells you where you stand:

- **All work uploaded** — nothing pending
- **N items waiting to upload** — saved on the phone, will send automatically
- **N items need attention** — the server refused something; open the **Queue**
  tab to see why

You can close the app, lock the phone or let the battery die with work queued.
It is written to disk, not held in memory.

> Work captured offline is marked as such for the supervisor reviewing it. That
> is expected and is not a mark against you — the app records that the time came
> from the phone rather than the server, because there was no server to ask.

## If something goes wrong

**"Could not reach the server"** — genuinely a connection problem. Move to
somewhere with signal; queued work is safe in the meantime.

**"Ask an administrator to check your housekeeping access"** — your account is
missing a module. Not something you can fix on the phone; send this message to
whoever administers the ERP.

**Signed out unexpectedly** — sign in again. Nothing queued is lost.

**A tab shows "forbidden"** — your role does not include that area of the
system. Tell your administrator which tab.

Anything else: note what screen you were on and what you had just tapped, and
send that with the phone model. That is usually enough to find it.

---

## What changed in 1.0.1

- Fixed: the Inspect tab could report "could not reach the server" when the real
  problem was a permissions gap, sending people to check a connection that was
  working fine. Errors now say what actually happened.
- Requires the matching server update to be deployed.
