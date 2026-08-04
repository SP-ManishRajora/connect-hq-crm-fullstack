# Housekeeping — User Manual

For supervisors, community managers, housekeeping staff and security operators.
Administrators should read the [admin manual](./housekeeping-admin-manual.md) as well.

Everything here works on a phone. Add the app to your home screen when prompted — inspections
open full-screen with the camera ready.

---

## Contents

1. [Running an inspection round](#1-running-an-inspection-round)
2. [Raising an issue](#2-raising-an-issue)
3. [Doing assigned work](#3-doing-assigned-work-my-tasks)
4. [Generator ON / OFF](#4-generator-on--off)
5. [Cleaning requests from clients](#5-cleaning-requests-from-clients)
6. [Why something was flagged](#6-why-something-was-flagged)

Photographs you take are analysed automatically where a model is configured; you confirm or
correct what it finds. See [About the AI findings](#about-the-ai-findings).

---

## 1. Running an inspection round

**Menu → Housekeeping → Inspections**

1. **Start round** — pick your centre if you are asked. If you left a round open earlier, it
   resumes rather than starting a new one.
2. **Scan area QR code** — point the camera at the sticker on the wall. If your phone cannot
   scan (common on iPhone), type the code printed underneath it instead.
3. **Take the photographs** — you will see four labelled slots, e.g. for a bathroom:
   *Washbasin & mirror · Toilet / urinal area · Floor & drainage · Consumables & dustbin*.
   Tap each one and take the photo directly; you cannot pick an old picture from your gallery.
4. **Fix anything the app warns about** — if a photo is blurred, too dark or looks like one you
   already submitted, retake it. Tap the same slot again to replace it.
5. **Add observations** (optional) — anything the photographs do not show.
6. **Submit this area**, then move to the next one.
7. **Complete round** when you have finished. You will see how many areas you covered and how
   many were missed.

### About the AI findings

The AI assists you; it does not overrule you. Your verdict is what counts, and every correction
you make is kept so the model can be evaluated and improved.

If you see *"AI analysis is not configured on this server"*, no model is installed yet — your
photographs are still stored and your inspection is completely unaffected.

Serious findings the AI is confident about may create a task automatically; you will see an
**issue raised** badge on those.

### Things that commonly confuse people

**"It says I'm 80 m away."** Your GPS thinks you are somewhere else. Step near a window or
wait a few seconds for the signal to settle, then scan again. If the area has never had its GPS
point saved, the app records the scan and marks it *unverified* rather than blocking you.

**"It says I finished too quickly."** Each area has a minimum time — 90 seconds for a bathroom,
for example. The timer at the top right shows your elapsed time. It does not stop you
submitting, but a manager will see the flag.

**Can I do the areas in any order?** Yes. The app only objects if two scans happen so close
together that you could not physically have walked between them.

---

## 2. Raising an issue

You can raise an issue while inspecting, or from the Issues screen at any time.

**During an inspection** — in the area screen, tap **+ Issue**, describe the problem, pick a
category and severity, and optionally attach one of the photos you just took as evidence.

**Anywhere else** — **Menu → Housekeeping → Issues & Actions → Raise issue**.

> **Hazards are escalated automatically.** If you describe something like an exposed wire, an
> open electrical panel, a diesel leak or a blocked exit, the system raises it to **Critical**
> with a 2-hour deadline no matter what severity you chose. You do not need to remember to do
> this — describe what you see in plain words.

---

## 3. Doing assigned work (My Tasks)

**Menu → Housekeeping → My Tasks** shows only what is assigned to you, most urgent first.

1. **Start work** when you begin.
2. **Take the after photograph** — this is required; you cannot submit without one.
3. **Submit for verification.**

A colleague or manager then checks it. **You cannot approve your own work** — that is
deliberate, not a bug.

If it comes back marked *Rework needed*, the reason is shown. Fix it and submit again.

**Cannot do it?** Tap **Unable to complete** and say why (part needed, area occupied, needs a
contractor). The task returns to the queue with your reason recorded — this is better than
leaving it open silently.

---

## 4. Generator ON / OFF

**Menu → Housekeeping → Generator**

### Switching ON
Tap **Switch ON** and supply:
- a photograph of the **control panel**
- a photograph of the **fuel tank / gauge**
- the **fuel reading** and **hour-meter reading**
- the reason (e.g. mains failure)

Both photographs are mandatory. Take them fresh — reusing an old photo is detected and flagged.

### While it runs
**Log a reading every 30 minutes** with a new tank photograph. The button turns red when you
are overdue, and a manager is alerted if it stays overdue.

### Switching OFF
Supply a final **tank** and **meter** photograph plus the closing readings. The app then works
out the run time, fuel used and litres per hour, and tells you immediately if the consumption
looks wrong.

### Refills
Tap **Refill** and enter litres, rate and vendor. **Always log a refill** — if the fuel level
rises without one, the system raises a discrepancy.

> The time is taken from the server, not your phone. If you record an event hours after it
> happened, that gap is recorded — enter events as they occur.

---

## 5. Cleaning requests from clients

Clients scan the **client QR** (a different sticker from yours) and raise a request themselves.

**Menu → Housekeeping → Cleaning Requests**

Progress a request: **Accept → On the way → Start work → Mark completed**.

To complete, you must:
1. upload at least one **after-cleaning photograph**, and
2. **scan the area QR code** to prove you are there.

Scanning the wrong area's code is rejected and names the area you should be in.

Urgent requests (spills, broken glass, anything with a safety risk) appear at the top with a
halved response target.

---

## 5a. Your own record

**Menu → Housekeeping → My Performance**

Your last 30 days: rounds run, areas submitted, how many of your scans were clean, work still
assigned to you, and — importantly — a breakdown of exactly how your efficiency score was
calculated, factor by factor.

If a score looks low, this page tells you *why*. It scores how work was handled, never how many
problems you reported: finding more issues can never count against you.

---

## 6. Why something was flagged

Flags are not accusations — they mark things a manager may want to look at.

| Flag | What it means | What to do |
|---|---|---|
| Outside permitted radius | GPS put you beyond the area's geofence | Move closer, scan again |
| No GPS position | Location was unavailable or denied | Allow location access |
| Completed faster than the minimum | You submitted below the area's minimum time | Spend the expected time |
| Duplicate photograph | The image matches one already submitted | Take a fresh photograph |
| Device changed mid-round | You switched phones during a round | Normal if genuine; finish on one device |
| Gallery upload | A photo came from the gallery, not the camera | Managers only; always visible |

**"This device has been revoked."** An administrator has blocked this phone from inspections —
usually because it was lost or reassigned. Contact your administrator; using a different device
works normally.

---

## Getting help

Photographs are kept for **180 days** and then deleted automatically. Scores, findings and the
full history are kept permanently, so an older inspection still shows what was found — just not
the picture.

Anything unclear or behaving oddly, tell your administrator: they can see the full audit trail
for every action.
