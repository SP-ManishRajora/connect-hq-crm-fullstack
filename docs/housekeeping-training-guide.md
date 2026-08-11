# Housekeeping — Staff Training Guide

**For the person running the training,** not for the trainees. It tells you what to say, in what
order, what to make each person do with their own hands, and how to know they have understood.

This is a *trainer's* document. It sits alongside the two reference manuals, which are what staff
keep afterwards:

| Document | Audience | Use it for |
|---|---|---|
| **This guide** | You, the trainer | Running the sessions |
| [User manual](./housekeeping-user-manual.md) | All field staff | The handout they keep |
| [Admin manual](./housekeeping-admin-manual.md) | Admins, Centre Managers | Setup and configuration |

> **Rule of the whole programme: nobody passes by watching.** Every section below ends with the
> trainee doing the task on their own phone while you watch. A person who has only seen it done
> will not do it correctly at 7 a.m. on a wet Monday.

---

## Contents

1. [Before you train anybody](#1-before-you-train-anybody)
2. [Who does what — the five jobs](#2-who-does-what--the-five-jobs)
3. [Roles and access, in plain terms](#3-roles-and-access-in-plain-terms)
4. [The training programme at a glance](#4-the-training-programme-at-a-glance)
5. [Session 1 — Everyone: getting in and finding your work](#5-session-1--everyone-45-min)
6. [Session 2 — Housekeeping staff: doing assigned work](#6-session-2--housekeeping-staff-60-min)
7. [Session 3 — Supervisors: inspection rounds](#7-session-3--supervisors-90-min)
8. [Session 4 — Supervisors & managers: issues and verification](#8-session-4--supervisors--managers-60-min)
9. [Session 5 — Cleaning requests from clients](#9-session-5--cleaning-requests-60-min)
10. [Session 6 — Generator operators](#10-session-6--generator-operators-60-min)
11. [Session 7 — Managers: reports, alerts and scores](#11-session-7--managers-60-min)
12. [Session 8 — Admins: setup and configuration](#12-session-8--admins-90-min)
13. [Competency sign-off sheets](#13-competency-sign-off-sheets)
14. [The awkward questions staff actually ask](#14-the-awkward-questions-staff-actually-ask)
15. [Trainer's crib sheet — every rule and number](#15-trainers-crib-sheet)

---

## 1. Before you train anybody

Work through this list a **week** before the first session. Most failed rollouts fail here, not in
the training room.

### 1.1 Your current setup status

Checked against the live database on **11 August 2026**:

| Thing | Status | Needed for |
|---|---|---|
| Centres active | ✅ 3 (CHQ_CP, CHQ-GP, CHQ_NOIDA) | Everything |
| Inspection areas | ✅ 60 (20 per centre) | Inspections, issues |
| Area QR codes | ✅ 63 generated | Inspection rounds |
| Client QR codes | ✅ 60 generated | Cleaning requests |
| **GPS points on areas** | ⚠️ **0 of 60 saved** | Geofence verification |
| **Staff accounts** | ⚠️ **1 housekeeping user** ("Dablu") | Everything |
| Devices registered | — 0 (registers itself on first use) | Nothing; automatic |
| AI photo analysis | ⚠️ Not configured | Optional; see below |

### 1.2 The three gaps, and what to do about each

**Gap 1 — No GPS points saved on any area.**
Nothing is blocked. A scan at an area with no saved GPS point is *accepted* and marked
**"Location has no saved GPS point"** for a manager to see. But you will not get real location
verification until the points are saved, and trainees will see that flag on every single scan and
start ignoring flags altogether — which is the real damage.

*Do this:* walk each centre with a Centre Manager, stand in each area, and save the GPS point from
**HK Setup / QR → Areas**. Budget roughly half a day per centre. If you cannot do this before
training, say so explicitly in Session 3 so trainees know that one flag is expected and the others
are not.

**Gap 2 — Only one housekeeping staff account exists.**
You cannot run Session 2 with one login. Create every trainee's account first, at
**Menu → Users → Invite**, and have each person log in *once* before the session so password resets
do not eat your training time.

**Gap 3 — AI photo analysis is not configured.**
Trainees will see *"AI analysis is not configured on this server"*. This is harmless — photographs
are stored and inspections work normally. Either configure it before training or tell people to
ignore that message. Do not let them discover it mid-exercise and assume the app is broken.

### 1.3 Practical preparation

- **A practice centre or practice areas.** Trainees will raise nonsense issues and take photos of
  the ceiling. Decide now whether that lands in live data. Cancelled issues stay visible in the
  audit log for good.
- **Phones.** Everyone brings the phone they will actually use. Training on your phone teaches
  nothing about their camera or their signal.
- **Wi-Fi and a weak-signal spot.** Show the app working in a basement or lift lobby, because that
  is where it will be used.
- **Printed QR stickers**, already on the walls. Scanning a code off a laptop screen is not the
  same skill as scanning a scuffed sticker at knee height in poor light.
- **A real generator**, if you are running Session 6. A photo of a photo will not do.
- **The user manual printed**, one per trainee, so they can write on it.

---

## 2. Who does what — the five jobs

The system recognises five *jobs*, which do not map one-to-one onto job titles. Get this clear in
your own head before you teach it, because most confusion in training comes from a person not
knowing which of these they are.

### Job A — Housekeeping Staff (the cleaner)
**Does:** the physical work. Receives tasks, does them, photographs the result, submits for checking.
**Screens:** My Tasks, My Performance.
**Does not:** run inspection rounds, approve their own work, or close issues.
**Key idea to teach:** *"The photograph is the proof. No photograph, no submission."*

### Job B — Supervisor (the inspector)
**Does:** walks the centre on rounds, scans each area's QR code, photographs it, raises issues for
anything wrong, and assigns them.
**Screens:** Inspections, Issues & Actions, My Performance.
**Key idea to teach:** *"Finding more problems never counts against you."* Supervisors who believe
they are scored on a clean report will file clean reports on dirty floors, and you will have built
an expensive way of lying to yourself.

### Job C — Centre Manager
**Does:** runs one centre. Assigns work, verifies completed work, handles escalations and alerts,
sets up areas and QR codes for their own centre.
**Screens:** all housekeeping screens, plus HK Setup / QR.
**Scope:** their own centre only.
**Key idea to teach:** *"You are the person who closes the loop."* Nothing reaches CLOSED without a
verification.

### Job D — Generator Operator
**Does:** logs generator ON, readings every 30 minutes, OFF, and every refill.
**Screens:** Generator.
**Key idea to teach:** *"Log it as it happens."* The server records the gap between the event and
the entry.

### Job E — Administrator / Owner
**Does:** creates users and roles, configures SLAs and thresholds, sees every centre, reads the
audit log.
**Screens:** everything.
**Key idea to teach:** the difference between a *role's* modules and a *person's* override — see
§3, and expect to explain it more than once.

> **One person, several jobs.** At a small centre the same person may inspect, verify and operate
> the generator. That is fine and the system allows it — with one hard exception: **nobody may
> verify their own work**, whatever their role. If a centre has only one person, someone from
> another centre or a manager must verify.

---

## 3. Roles and access, in plain terms

Teach this to admins in full (Session 8) and to everyone else in one sentence: *"If you cannot see
a menu item, your role does not have it — ask your manager, do not hunt for it."*

### How the system decides what someone sees

Three checks, in this order. **The first one that applies wins.**

1. **The person's own module list** (a per-user override). If set, it decides everything and the
   role is ignored entirely.
2. **Their role's module list**, from the roles screen at **Menu → Users → Roles**.
3. **The built-in defaults in code**, used only if the database is unreachable.

Step 1 is where administrators trip up. Grant someone a personal override and their role stops
mattering for them, permanently, until you clear it. If you later add a module to their role, they
will *not* get it.

> **This is live in your data right now.** The user "Dablu" holds the custom role `HOUSEKEEPING`,
> which grants both `hk_issues` and `hk_requests`. But Dablu also has a personal override listing
> `hk_issues` and **not** `hk_requests`. So Dablu can be assigned issues and cannot be assigned
> cleaning requests — the override wins. If that is not what you intended, clear the override at
> **Users → Modules** and let the role decide.

### The modules, and who has them by default

| Module | What it unlocks | Roles holding it by default |
|---|---|---|
| `housekeeping` | HK Dashboard, Alerts, Client Reviews | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_inspect` | Inspections, My Performance | ADMIN, OWNER, OPS, CENTER_MANAGER |
| `hk_issues` | Issues & Actions, **My Tasks** | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_requests` | Cleaning Requests | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_generator` | Generator | ADMIN, OWNER, MANAGER, OPS, CENTER_MANAGER |
| `hk_reports` | HK Reports | ADMIN, OWNER, MANAGER, CENTER_MANAGER |
| `hk_admin` | HK Setup / QR | ADMIN, OWNER, CENTER_MANAGER |

Your custom `HOUSEKEEPING` role holds `hk_inspect`, `hk_issues`, `hk_generator`, `hk_reports` and
more. Custom roles are first-class: anyone whose role grants `hk_issues` can be assigned work,
with no code change needed.

**A trap worth naming out loud:** `My Tasks` and `Issues & Actions` are the *same* module,
`hk_issues`. You cannot give a cleaner their task list without also giving them the full issues
screen. Tell staff plainly: *"You will see all the centre's issues. Work only from My Tasks."*

### Centre scoping

Admins and Owners see every centre. Everyone else sees only their own centre — **provided they have
a centre set on their account.**

> ⚠️ **Check this before training.** All your housekeeping and centre-manager users currently have
> **no centre assigned**, and a user with no centre set is not restricted to one — they see every
> centre's data. Set each person's centre at **Menu → Users** before you train them, or you will
> teach a scoping rule that your own data visibly contradicts.

---

## 4. The training programme at a glance

Run the sessions in order. Session 1 is for everybody; after that, people attend only what their
job needs.

| # | Session | Who attends | Length |
|---|---|---|---|
| 1 | Getting in and finding your work | **Everyone** | 45 min |
| 2 | Doing assigned work | Housekeeping staff, supervisors | 60 min |
| 3 | Inspection rounds | Supervisors, centre managers | 90 min |
| 4 | Issues and verification | Supervisors, centre managers | 60 min |
| 5 | Cleaning requests | Staff, supervisors, centre managers | 60 min |
| 6 | Generator | Generator operators, security | 60 min |
| 7 | Reports, alerts and scores | Managers, centre managers | 60 min |
| 8 | Setup and configuration | Admins, centre managers | 90 min |

### Suggested three-day shape

**Day 1 (morning)** — Session 1, everyone together. Then Session 2 for cleaners while supervisors
break.
**Day 1 (afternoon)** — Session 3, on the floor, walking real areas.
**Day 2 (morning)** — Sessions 4 and 5.
**Day 2 (afternoon)** — Session 6 at the generator; Session 7 for managers in parallel.
**Day 3** — Session 8 for admins. Then supervised live use: everyone does their real job while you
watch and correct.

Day 3 matters more than it looks. The first real shift is where habits set.

### Group sizes

Six to eight people maximum for hands-on sessions. Every trainee must complete every exercise on
their own phone while you watch — you cannot watch twelve phones.

---

## 5. Session 1 — Everyone (45 min)

**Goal:** every person can log in, find their work, and knows who to ask when stuck.

### Teach (15 min)

1. **Logging in.** Their email and password. Have everyone log in *now* — sort out failures before
   going further.
2. **Add to home screen.** Prompt them when it appears. Inspections open full-screen with the
   camera ready, and this genuinely changes how usable the app is on a phone.
3. **The menu.** Open it, find the Housekeeping group. Explain that everyone's menu is different
   because it reflects their role. *"Your neighbour seeing something you don't is normal."*
4. **Where your work lives.**
   - Cleaners → **My Tasks** 🧽
   - Supervisors → **Inspections** 📸
   - Managers → **HK Dashboard** 🧹 and **Alerts** 🔔
5. **The honesty principle.** Say this early and plainly: the app records what happened — who did
   what, when, from which phone. This is not surveillance of *them*; it is what lets a good job be
   proved when a client complains. Staff who understand this cooperate. Staff who think it is a
   trap find workarounds.

### Practise (20 min)

Every trainee, on their own phone:

- [ ] Log in unaided
- [ ] Add the app to their home screen
- [ ] Open their main work screen and say aloud what they see
- [ ] Log out and back in

### Check (10 min)

Ask each person: *"It's Monday morning. Where do you tap first?"* They must answer without
opening the menu to hunt.

---

## 6. Session 2 — Housekeeping staff (60 min)

**Goal:** complete an assigned task end to end, with evidence.

### Teach (20 min)

**Menu → Housekeeping → My Tasks** shows only what is assigned to them, most urgent first.

The three-step loop, which never varies:

1. **Start work** — tap when you actually begin, not when you read it.
2. **Take the after photograph** — required; the submit button stays locked without one.
3. **Submit for verification** — a colleague or manager checks it.

Then teach the four things that go wrong:

**"Rework needed."** The verifier rejected it and the reason is shown. Fix it and submit again.
Not a punishment — the loop working.

**"Unable to complete."** Part needed, area occupied, needs a contractor. Tap it, give the reason,
and the task returns to the queue with the reason recorded. Say this clearly: **reporting that you
cannot do something is a correct outcome, and always better than silence.** If staff believe this
button counts against them, they will leave tasks open instead and your queue will fill with lies.

**"You cannot approve your own work."** Deliberate. Not a bug. Expect to say it twice.

**Colour and urgency.** Red border means overdue. The list is already in the right order — work
from the top.

### Practise (30 min)

Assign each trainee two real tasks beforehand. Each person must:

- [ ] Find their task list unaided
- [ ] Start a task
- [ ] Take an after photograph with their own camera
- [ ] Submit it, and see the "waiting for verification" state
- [ ] On the second task, use **Unable to complete** with a sensible reason
- [ ] Find a rejected task and resubmit it (reject one yourself so they see it)

### Check (10 min)

- *"You've finished but your phone won't upload the photo — what do you do?"*
  (Stay on the screen, retry; do not abandon the task or start it again.)
- *"You can't get into the room. What do you tap?"* (Unable to complete, with the reason.)
- *"Can you close your own task?"* (No.)

### Common failure to watch for

Someone photographs the *area* rather than the *thing they fixed*. Correct this immediately and
in front of the group — a wide shot of a clean-looking room proves nothing and it is the single
most common bad habit.

---

## 7. Session 3 — Supervisors (90 min)

**Goal:** run a complete inspection round on real areas.

**Run this session walking the centre.** Not in a room. The skills are physical.

### Teach (25 min)

**Menu → Housekeeping → Inspections**

1. **Start round** — pick the centre if asked. An open round from earlier *resumes* rather than
   starting a new one.
2. **Scan the area QR code** — point at the wall sticker. If the camera will not scan (common on
   iPhone), **type the code printed underneath**. Teach the typing fallback properly; a supervisor
   who cannot scan and does not know the fallback simply stops inspecting.
3. **Take the photographs** — four labelled slots. For a bathroom: *Washbasin & mirror · Toilet /
   urinal area · Floor & drainage · Consumables & dustbin*. Tap each slot and shoot directly —
   **the gallery is not available**, by design.
4. **Fix what the app warns about** — blurred, too dark, or a duplicate. Tap the same slot to
   retake.
5. **Add observations** — anything the photographs cannot show. Smell, noise, a running tap.
6. **Submit this area**, then move on.
7. **Complete round** — shows areas covered and areas missed.

### The areas your supervisors will actually meet

Your 60 areas (20 per centre), with the minimum time each expects. Every area wants **4
photographs**. Hand this out — supervisors ask "how long am I meant to spend?" constantly.

| Area type | Count | Minimum time |
|---|---|---|
| Bathroom | 24 | 90 s |
| Common area | 15 | 60 s |
| Parking | 3 | 60 s |
| Electricity room | 3 | 60 s |
| Generator area | 3 | 60 s |
| Fuel tank | 3 | 60 s |
| Front area | 3 | 45 s |
| Back area | 3 | 45 s |
| Guard room | 3 | 45 s |

The minimum does not block submission — it flags it. Teach it as *"the time this job honestly
takes"*, not as a timer to beat.

The four photo slots are labelled per area type. Bathroom: *Washbasin & mirror · Toilet / urinal
area · Floor & drainage · Consumables & dustbin*. Generator area: *Full generator view · Control
panel · Fuel tank / gauge · Surrounding floor*.

### The flags, and what to say about them

Frame flags correctly or you will create either fear or contempt. Say: **"A flag is a note for a
manager, not an accusation. Most have innocent explanations."**

| Flag | Cause | What the supervisor does |
|---|---|---|
| Location has no saved GPS point | The area has no GPS saved | Nothing — expected in your setup today |
| Outside permitted radius | GPS put you beyond the geofence | Move closer, scan again |
| No GPS position | Location unavailable or denied | Allow location access |
| Completed faster than the minimum | Below the area's minimum time | Spend the expected time |
| Duplicate photograph | Image matches one already submitted | Take a fresh photograph |
| Device changed mid-round | Switched phones mid-round | Fine if genuine; finish on one device |

**Say explicitly:** *"Right now every area will show 'no saved GPS point' because we have not saved
the GPS positions yet. Ignore that one. Do not ignore the others."*

### Practise (50 min)

Walking the floor. Each supervisor:

- [ ] Starts a round
- [ ] Scans at least four areas by camera
- [ ] Types a code manually for one area
- [ ] Takes all four photographs for one area properly
- [ ] Deliberately takes a bad photo, sees the warning, retakes it
- [ ] Adds an observation
- [ ] Raises one issue from inside the round (leads into Session 4)
- [ ] Completes the round and reads the summary

### Check (15 min)

- *"Your phone won't scan the sticker. Now what?"* (Type the code underneath.)
- *"Can you do areas in any order?"* (Yes — only implausibly fast movement between two scans is
  questioned.)
- *"You get 'you're 80 m away'. What's happened?"* (GPS drift. Step near a window, wait, scan again.)
- *"Half-way through, your battery dies and you finish on another phone. Problem?"* (No — flagged
  as a device change, which is fine when genuine.)

---

## 8. Session 4 — Supervisors & managers (60 min)

**Goal:** raise a good issue, assign it, and verify completed work honestly.

### Teach — raising (15 min)

Two routes: **during an inspection**, tap **+ Issue** in the area screen (and attach one of the
photos you just took); or any time via **Issues & Actions → Raise issue**.

A good issue has: a **specific title**, the **right category**
(cleanliness · maintenance · safety · consumables · presentation), an honest **severity**, and a
**before photograph**.

Teach severity through its deadline, because that is what it actually means:

| Severity | Deadline from raising |
|---|---|
| Critical | **2 hours** |
| High | **8 hours** |
| Medium | **24 hours** |
| Low | **72 hours** |

**Hazards escalate themselves.** Describe an exposed wire, open electrical panel, diesel or gas
leak, blocked exit, sewage or major overflow, and the system forces **Critical** with a 2-hour
deadline regardless of what severity was chosen — and alerts management immediately. Tell staff to
**describe what they see in plain words** and let the system handle it.

### Teach — assigning (10 min)

Open the issue, pick a person from the assignee list. The list shows everyone who can hold that
work at that centre, including custom roles such as `HOUSEKEEPING`.

Changing severity **resets the clock** — a downgraded issue does not stay due in two hours.

### Teach — verifying (20 min)

This is the part people do badly, so spend the time.

Work arrives as **Awaiting verification**. Compare the before and after photographs, then:

- **PASS** → the issue closes.
- **FAIL** → it returns as **Rework needed** with your reason, and the deadline clock re-arms.

Three rules to state plainly:

1. **You cannot verify your own work.** Whoever did it cannot sign it off. (Admins and Owners are
   technically exempt so a one-person site is never deadlocked — but treat that as an emergency
   escape hatch, not normal practice, and do not advertise it to the room.)
2. **Every verdict is permanent and recorded** — pass or fail, with your name on it.
3. **A closed issue cannot be reopened.** If the problem returns, raise a *new* issue. This is
   deliberate: it keeps the history of each occurrence separate and countable.

**Teach people to fail work when it deserves it.** A verifier who passes everything is worse than
no verifier, because they produce a record that says the centre is clean. If you only make one
point stick in this session, make it this one.

### Practise (15 min)

In pairs, each supervisor:

- [ ] Raises an issue with a before photo and a sensible severity
- [ ] Raises one described as *"exposed wire near the panel"* and watches it become Critical
- [ ] Assigns it to their partner
- [ ] Partner completes it (from Session 2)
- [ ] Verifies their partner's work — **failing it once** with a written reason
- [ ] Partner reworks and resubmits; verifier passes it

Everyone must both fail something and receive a failure. It removes the sting from the real thing.

---

## 9. Session 5 — Cleaning requests (60 min)

**Goal:** take a client request from arrival to closure.

### Teach (20 min)

Clients scan the **client QR code** — a *different* sticker from the area codes — and raise the
request themselves. Show both stickers side by side; they get mixed up constantly.

**Menu → Housekeeping → Cleaning Requests**

The progression: **Accept → On the way → Start work → Mark completed.**

To complete, staff must upload at least one **after-cleaning photograph** and **scan the area QR
code** to prove presence. Scanning the wrong area's code is rejected and tells them which area they
should be in.

**Urgent requests** — spills, broken glass, anything with a safety risk — appear at the top with
**half the normal response target** (minimum five minutes).

**Auto-assignment is on.** New requests are routed automatically to the person with the lightest
load at that centre. Staff should expect work to arrive without a manager touching it.

> With your current data, "Dablu" will **not** receive auto-assigned cleaning requests, because his
> personal module override omits `hk_requests`. Fix the override before this session or the
> demonstration will not work.

### Practise (30 min)

- [ ] Each trainee scans a client QR as if they were a client, and raises a request
- [ ] Watch it appear and auto-assign
- [ ] The assignee progresses it through all four states
- [ ] Complete it properly, with photo and area scan
- [ ] One person deliberately scans the **wrong** area code and reads the rejection
- [ ] Raise one urgent request and compare its position and deadline

### Check (10 min)

- *"A client says the toilet is filthy but hasn't scanned anything. What do you do?"*
  (Raise it yourself as an issue — do not wait for a client request.)
- *"Why won't it let me complete?"* (Missing after photo, or the wrong area scanned.)

---

## 10. Session 6 — Generator operators (60 min)

**Goal:** log a full ON → readings → OFF cycle, plus a refill.

**Run this at the generator.**

### Teach (20 min)

**Menu → Housekeeping → Generator**

**Switching ON** requires all of: a **control panel** photograph, a **fuel tank / gauge**
photograph, the **fuel reading**, the **hour-meter reading**, and the reason (mains failure, test
run). Both photographs are mandatory and must be fresh — reused images are detected and flagged.

**While running:** a reading every **30 minutes**, each with a **new tank photograph**. The button
turns red when overdue, and a manager is alerted if it stays overdue.

**Switching OFF:** final tank and meter photographs plus closing readings. The app computes run
time, fuel used and litres per hour, and warns immediately if consumption looks wrong.

**Refills:** litres, rate, vendor. **Always log a refill.** If the fuel level rises without one,
the system raises a discrepancy that a manager must resolve — that is the whole point of the
feature, and it is the rule most often broken.

**Time comes from the server, not the phone.** Logging an event hours late records the gap. Enter
events as they happen.

### Practise (30 min)

- [ ] Log a real ON with both photographs and both readings
- [ ] Log a 30-minute reading with a fresh tank photograph
- [ ] Log a refill with litres, rate and vendor
- [ ] Log OFF and read the computed consumption
- [ ] Try to reuse an old photograph and see it flagged

### Check (10 min)

- *"You refuelled but didn't log it. What happens?"* (Fuel rises without a refill → discrepancy →
  a manager has to resolve it.)
- *"You forgot the 10 a.m. reading and it's now 11. What do you do?"* (Log it now; the delay is
  recorded. Do not backdate or invent it.)

---

## 11. Session 7 — Managers (60 min)

**Goal:** read the day's state in five minutes and act on the right things.

### Teach (30 min)

**HK Dashboard** 🧹 — the centre's state now.

**Alerts** 🔔 — things demanding attention: critical issues, overdue work, generator discrepancies,
missed inspections, suspicious scans, duplicate photographs. Acknowledge an alert and your name is
on it. Teach the discipline: **acknowledge means you have taken responsibility, not that you have
read it.**

**HK Reports** 📋 — trends over time, per area and per person.

**Client Reviews** ⭐ — what clients say, alongside what your own inspections claim. Divergence
between the two is the most useful signal in the module.

**Efficiency scores** — each person's score, with a factor-by-factor breakdown at **My
Performance**. State the design intent clearly: the score measures **how work was handled, never
how many problems were reported.** Finding more issues can never lower a score. Managers must
repeat this to their teams, or supervisors will quietly under-report.

Scores can be overridden with a reason when circumstances warrant — the override and its reason are
recorded.

### Practise (20 min)

- [ ] Read today's dashboard and name the three things needing attention
- [ ] Acknowledge a real alert
- [ ] Open a report and identify the worst-performing area this week
- [ ] Open a staff member's efficiency breakdown and explain one factor aloud
- [ ] Find an issue about to breach its deadline and reassign it

### Check (10 min)

- *"A supervisor's score dropped and they're upset. What do you do?"* (Open the breakdown together;
  it shows exactly why, factor by factor.)
- *"Reports say clean; a client complains. Where do you look?"* (Client Reviews against inspection
  photos for that area, then the flags on those rounds.)

---

## 12. Session 8 — Admins (90 min)

**Goal:** set up a centre and configure the module without breaking access for everyone else.

### Teach (45 min)

**Areas and QR codes** — **HK Setup / QR**. Each area has a category, photo slots, a checklist, a
minimum dwell time, and a GPS point with a geofence radius (default 50 m). Print QR sheets from
here. **This is where your missing GPS points get fixed** — walk each area and save its point.

**Users and roles** — **Menu → Users**. Invite users; assign a role; **set their centre**.
Then teach the override rule from §3 slowly, because it causes the most support calls:

> Giving one person a custom module list means their role no longer applies to them. Ever. Until
> you clear it. Prefer editing the *role* over overriding the *person*.

Show the **Roles** tab. Custom roles like `HOUSEKEEPING` are first-class — grant a role a module
and everyone with it gains that access, including appearing in assignee lists.

**Settings** — SLA hours per severity (2 / 8 / 24 / 72), whether an after photograph is required
(**on** — leave it on), auto-assignment, GPS strictness (currently *flag*, not *reject*), and
whether managers may upload from the gallery (currently allowed, always flagged).

**Devices** — phones register themselves on first use. Revoke a lost or reassigned phone here; the
user sees *"This device has been revoked."*

**Retention** — photographs are deleted after **180 days**. Scores, findings and history are kept
permanently, so an old inspection still shows what was found, just not the picture. Tell managers
this before someone goes looking for a year-old photo.

**Audit log** — every action, permanently. This is your answer to "who changed this?"

### Practise (35 min)

- [ ] Create a test area, set its GPS point and radius, print its QR
- [ ] Invite a test user, give them a role **and a centre**, log in as them
- [ ] Give that user a module override, observe their menu change, then **clear it**
- [ ] Change a role's modules and watch every holder's access change
- [ ] Change the Low-severity SLA, raise a Low issue, confirm the new deadline
- [ ] Revoke a device, see the message, restore it
- [ ] Find one of today's training actions in the audit log

### Check (10 min)

- *"Someone can't see Cleaning Requests though their role has it. Why?"* (A personal override is
  overriding their role.)
- *"A phone was stolen. What do you do first?"* (Revoke the device.)
- *"A manager wants a photo from last year."* (Gone after 180 days; the findings remain.)

---

## 13. Competency sign-off sheets

Do not certify anybody on attendance. Certify them on doing the task unaided, with you watching.
Print one row per person.

### Housekeeping staff

| # | Must be able to, unaided | ✓ | Date |
|---|---|---|---|
| 1 | Log in and reach My Tasks | | |
| 2 | Start a task | | |
| 3 | Take a valid after photograph of *the work*, not the room | | |
| 4 | Submit for verification | | |
| 5 | Handle a rework rejection and resubmit | | |
| 6 | Use Unable to complete with a real reason | | |
| 7 | Explain why they cannot approve their own work | | |

### Supervisors

| # | Must be able to, unaided | ✓ | Date |
|---|---|---|---|
| 1 | Everything in the staff sheet | | |
| 2 | Start, run and complete a round | | |
| 3 | Scan by camera **and** enter a code manually | | |
| 4 | Take all required photographs for an area | | |
| 5 | Recognise and act on each flag | | |
| 6 | Raise an issue with correct category and severity | | |
| 7 | Explain what makes something Critical | | |
| 8 | Assign an issue to the right person | | |
| 9 | Verify work, including failing it with a reason | | |
| 10 | State that more issues found never lowers their score | | |

### Generator operators

| # | Must be able to, unaided | ✓ | Date |
|---|---|---|---|
| 1 | Log ON with both photographs and both readings | | |
| 2 | Log a 30-minute reading with a fresh photograph | | |
| 3 | Log a refill completely | | |
| 4 | Log OFF and read the consumption result | | |
| 5 | Explain what happens if a refill goes unlogged | | |

### Centre managers

| # | Must be able to, unaided | ✓ | Date |
|---|---|---|---|
| 1 | Everything in the supervisor sheet | | |
| 2 | Read the dashboard and name today's priorities | | |
| 3 | Acknowledge an alert and explain what that commits them to | | |
| 4 | Reassign work before a deadline breach | | |
| 5 | Explain an efficiency score from its breakdown | | |
| 6 | Create an area, save its GPS point, print its QR | | |

### Administrators

| # | Must be able to, unaided | ✓ | Date |
|---|---|---|---|
| 1 | Invite a user with the right role **and centre** | | |
| 2 | Explain override-beats-role, and when to use each | | |
| 3 | Edit a role's modules | | |
| 4 | Change an SLA and verify the effect | | |
| 5 | Revoke and restore a device | | |
| 6 | Find any action in the audit log | | |
| 7 | State the 180-day photo retention rule | | |

---

## 14. The awkward questions staff actually ask

Prepare real answers. Evasion here costs you cooperation for the whole rollout.

**"Is this to catch us out?"**
No — and say why concretely. It records what was done so good work can be proved when a client
complains. The efficiency score deliberately ignores how many problems you report.

**"Why must I photograph everything?"**
Because a photograph is the only evidence that survives the shift. Without it, a dispute becomes
one person's word against another's, and the person on the floor usually loses.

**"Why can't I approve my own work?"**
Because self-approval makes the record worthless. It applies to everyone, up to and including
managers.

**"What if I genuinely can't do the task?"**
Use **Unable to complete** and say why. It is a correct outcome, recorded properly. Leaving it open
silently is the only wrong answer.

**"The app flagged me. Am I in trouble?"**
No. A flag is a note for a manager and most have innocent explanations — bad GPS, a changed phone.
Patterns get looked at, single flags do not.

**"My phone is old and slow."**
Tell your manager. Genuinely — an inspection on a phone that cannot hold a camera is a real
problem, not an excuse, and it is fixable.

**"Someone else used my login."**
Report it immediately. Every action is recorded against *your* name, which is exactly why sharing
logins is not acceptable.

**"What if I lose signal?"**
Stay on the screen and let it retry. Do not abandon and restart, which creates duplicates.

---

## 15. Trainer's crib sheet

Everything on one page. Verified against the code, not from memory.

### Issue deadlines (default, admin-configurable)
| Critical | High | Medium | Low |
|---|---|---|---|
| 2 h | 8 h | 24 h | 72 h |

### Issue lifecycle
```
OPEN → ASSIGNED → IN_PROGRESS → AWAITING_VERIFICATION → CLOSED
                                          ↓ (fail)
                                      REJECTED → IN_PROGRESS
```
`CLOSED` and `CANCELLED` are final. A recurring problem becomes a **new** issue.

### Cleaning request lifecycle
```
NEW → ASSIGNED → ACCEPTED → ON_THE_WAY → IN_PROGRESS → COMPLETED → CLOSED
```
Urgent = **half** the normal target, minimum 5 minutes.

### Auto-escalating hazard phrases
Exposed wire · live wire · open (electrical) panel · water leak near electrics · diesel or fuel
leak · gas leak · blocked exit or emergency exit · fire exit blocked · sewage · major water
overflow.

Any of these in the title or description ⇒ **Critical, 2-hour deadline, management alerted** —
whatever severity was chosen.

### Verification rules
- Assignee cannot verify their own work.
- PASS → closed. FAIL → rework, deadline clock re-arms.
- Every verdict is permanent and attributed.

### Defaults you may be asked about
| Setting | Default | Meaning |
|---|---|---|
| After photograph required | **On** | Cannot submit work without one |
| Outside geofence | **Flag, not reject** | Scan accepted, marked for review |
| Max GPS accuracy | 100 m | Worse is treated as unreliable |
| Min seconds between scans | 20 s | Closer together is suspicious |
| Max travel speed | 80 km/h | Faster between areas is implausible |
| Photo clock skew | 15 min | Larger gap is flagged |
| Gallery upload (managers) | Allowed | Always flagged when used |
| Request auto-assign | **On** | Routed by lightest load |
| Auto-close after | 24 h | Completed requests close automatically |
| Photo retention | **180 days** | Findings and scores kept permanently |
| Geofence radius | 50 m | Per area, configurable |

### Access resolution, in order
1. The person's own module override — **wins outright if set**
2. Their role's modules (Users → Roles)
3. Built-in code defaults (fallback only)

### Menu map
| Screen | Module needed |
|---|---|
| HK Dashboard, Alerts, Client Reviews | `housekeeping` |
| Inspections, My Performance | `hk_inspect` |
| Issues & Actions, **My Tasks** | `hk_issues` |
| Cleaning Requests | `hk_requests` |
| Generator | `hk_generator` |
| HK Reports | `hk_reports` |
| HK Setup / QR | `hk_admin` |

### Things to fix before training
1. Save GPS points for all 60 areas (0 done)
2. Create staff accounts and **set each person's centre** (currently none set)
3. Decide on the AI message, or configure a model
4. Clear or correct Dablu's module override if he should handle cleaning requests

---

## After training

**Week 1** — watch real shifts. Correct habits immediately; the first week sets them.
**Week 2** — review flags and rejected work together, without blame, to find who needs a top-up.
**Month 1** — check the numbers: are issues being raised at all three centres? Is anyone passing
every verification without ever failing one? Both are signs of training that did not stick, not of
a perfect centre.

Keep the [user manual](./housekeeping-user-manual.md) where staff can reach it, and re-run the
relevant single session for each new joiner rather than the whole programme.
