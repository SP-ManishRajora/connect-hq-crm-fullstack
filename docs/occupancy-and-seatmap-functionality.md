# Occupancy & Seat Map — Functionality & Business Logic Reference

A behavior-focused reference for the two space-tracking features. For the implementation
plan, schema details and phase roadmap, see [occupancy-module.md](./occupancy-module.md).
This doc answers "what do these features *do*, and what rules govern them".

Last reviewed against code: Seat Map (live), Occupancy (Phase 1–2 built; Phases 3–8 planned).

---

## 1. The two features at a glance

| | **Seat Map** (`/seatmap`) | **Occupancy** (`/occupancy`) |
|---|---|---|
| Role today | Read-only visual glance | Management console + overview |
| Question it answers | "Where is everyone sitting right now?" | "How is every space being used, by whom, under what agreement?" |
| Data source | Legacy `Seat.occupied` / `partialOccupancy` | New unified `Space` (+ `Allocation`, `Reservation`, `SpaceTransfer`, `OccupancyHistory`) |
| States | 3: Occupied / Partial / Empty | 5: Available / Occupied / Reserved / Maintenance / Blocked |
| Interactive | No | Yes (allocate / reserve / transfer / block — phased) |
| Links to clients & contracts | No | Yes |
| History / audit | No | Yes (append-only ledger + AuditLog) |
| Reports | No | Yes (planned) |

**Convergence:** Occupancy will absorb Seat Map. Once the interactive Occupancy map
(Phase 6) ships as a superset, `/seatmap` is retired (redirected into Occupancy) and the
legacy seat↔space sync is removed — `Space` becomes the single source of truth.

---

## 2. Seat Map — functionality & business logic

### 2.1 What it shows
- A per-center visual grid: each **Cabin** is a block of seat tiles; loose seats appear
  under "Open / hot-desk seats".
- Per-center summary: `occupied / total (percent%)`.
- Optional uploaded floor-map image (`Center.mapImagePath`).
- Color legend (the only three states):
  - 🟢 **Green = Occupied** — `Seat.occupied = true`.
  - 🟠 **Orange = Partial occupancy** — `Seat.partialOccupancy = true`: the client has
    taken the whole cabin but is not actually using this seat.
  - ⬜ **Grey = Empty** — neither flag set.

### 2.2 How seat state is set (the write paths)
Seat Map itself is read-only; the flags it renders are written elsewhere:

**Assign a client to a cabin** — `POST /api/centers/[id]/assign-cabin`
- Input: `{ cabinId, clientId, occupiedSeats }`.
- `occ = clamp(occupiedSeats, 0, cabin.capacity)`.
- For each seat in the cabin, in order: first `occ` seats → `occupied = true`; the rest →
  `partialOccupancy = true`. (So taking a 6-seat cabin but using 4 → 4 green + 2 orange.)
- Updates the `Client`: `cabinId`, `occupiedSeats = occ`, `totalCabinSeats = cabin.capacity`.
- **Unassign** clears all cabin seats (`occupied=false, partialOccupancy=false,
  assignedClientId=null`) and resets the client's seat counts to 0.
- Access: caller must manage that center (`canManageCenter`).

**Adjust how many seats a client actually uses** — `POST /api/clients/[id]/occupancy`
- Input: `{ occupiedSeats }`, clamped to `client.totalCabinSeats`.
- Re-marks the cabin's seats: first `occ` occupied, remainder partial, all tagged
  `assignedClientId`.

### 2.3 Business rules that ride on these counts
- **Half-price unused seats:** when a client holds a cabin but uses fewer seats, the unused
  seats are billed at 50% (handled in monthly invoicing).
- **Upsell reminder (daily cron)** — `POST /api/clients/run-occupancy-reminders`:
  flags clients where `totalCabinSeats > 0 && occupiedSeats < totalCabinSeats` continuously
  for **> 3 months**, emails the sales team an upsell alert, and records
  `unusedSeatReminderSent` / `unusedSeatLastReminderAt` (so it nudges at most once per 3-month window).

### 2.4 Limitations (why Occupancy exists)
No reservations, no maintenance/blocked states, no agreement linkage, no history, not
clickable, single legacy source of truth that several routes write independently.

---

## 3. Occupancy — functionality & business logic

### 3.1 Domain model (concepts)
- **Space** — the unified rentable unit. Types: `DEDICATED_SEAT`, `HOT_DESK`, `CABIN`,
  `MEETING_ROOM`, `PRIVATE_OFFICE`, `VIRTUAL_OFFICE`. Bridges to a legacy
  `Seat`/`Cabin`/`MeetingRoom` row when applicable. Soft-deleted via `deletedAt`.
- **Allocation** — a client occupying a space for a period, optionally under a `Contract`
  (= the agreement). Supports `seatsTaken` for partial cabin/floor use.
- **Reservation** — a temporary hold on an AVAILABLE space until `expiresAt`.
- **SpaceTransfer** — record of moving a space from one client to another (bulk groups via `batchId`).
- **OccupancyHistory** — append-only ledger; one row per event. **Never updated or deleted.**

### 3.2 Space statuses & colors
- 🟢 **AVAILABLE** — free to allocate or reserve.
- 🔴 **OCCUPIED** — has an active allocation.
- 🟡 **RESERVED** — held by a reservation until it expires.
- ⬜ **MAINTENANCE** — temporarily out of service.
- ⬛ **BLOCKED** — admin-blocked (not rentable).

### 3.3 Core operations (service layer — `src/lib/occupancy/service.ts`)
All operations are **transactional**, write an `OccupancyHistory` row, and **emit an event**
(audited via `logAction`). Errors are typed `HttpError(status, message)`.

**Allocate** `allocateSpaces(input, actor)` — bulk-capable
- Validates client (and contract if given) exist.
- Each space must be **AVAILABLE or RESERVED**; `seatsTaken ≤ capacity`.
- Creates `Allocation(ACTIVE)`, sets space → **OCCUPIED**, logs history `ALLOCATED`.
- Emits `OccupancyAllocated`.

**Release** `releaseAllocation(allocationId, input, actor)`
- Allocation must be **ACTIVE**.
- `reason = TERMINATED` (manual vacate) or `EXPIRED` (agreement lapsed) → allocation status set accordingly.
- Space → **AVAILABLE**; history `RELEASED`/`EXPIRED` with `vacatedAt`.
- Emits `OccupancyReleased`.

**Reserve** `reserveSpace(input, actor)`
- Space must be **AVAILABLE**; `expiresAt` must be in the future.
- Creates `Reservation`, sets space → **RESERVED**, history `RESERVED`.
- Emits `ReservationCreated`. (Auto-release on expiry is the Phase-7 cron.)

**Transfer** `transferSpaces(input, actor)` — bulk-capable, grouped by `batchId`
- Ends the current ACTIVE allocation (→ **TRANSFERRED**), captures `prevClientId`.
- Creates a new `Allocation(ACTIVE)` for the target client; space stays **OCCUPIED**.
- Writes a `SpaceTransfer` row + history `TRANSFERRED`.
- Emits `OccupancyTransferred`.

### 3.4 State-transition rules (summary)
```
AVAILABLE --allocate--> OCCUPIED --release--> AVAILABLE
AVAILABLE --reserve--> RESERVED --(consume)--> OCCUPIED
RESERVED  --(cron: expiresAt < now)--> AVAILABLE
OCCUPIED  --transfer--> OCCUPIED (new client)
any       --admin--> MAINTENANCE | BLOCKED   (manual; not touched by seat sync)
```

### 3.5 Agreement / invoice integration (rules)
- **Contract active → occupancy active.**
- **Contract expired → allocation EXPIRED → space AVAILABLE** (release with `reason=EXPIRED`).
- **Invoice overdue → warning flag** on the client's occupancy row — *computed at read time,
  not stored.*

### 3.6 Events (in-process, all audited)
`OccupancyAllocated`, `OccupancyReleased`, `OccupancyTransferred`, `ReservationCreated`,
`ReservationExpired`, `AgreementExpired`. New side-effects = register a listener
(`onOccupancyEvent`); no service change needed.

### 3.7 Dashboard / KPIs (overview page today; full dashboard Phase 4)
Total Spaces · Occupied · Available · Reserved · Occupancy % · Vacancy % · by-type ·
by-center. Planned: Upcoming Vacancies, Expiring Agreements, Revenue per Seat/Floor,
Upcoming Renewals.

### 3.8 Access control (RBAC)
- `occupancy` (view): ADMIN, OWNER, MANAGER, CENTER_MANAGER, SALES, ACCOUNTS.
- `occupancy_manage` (create/edit/transfer/allocate): ADMIN, OWNER, MANAGER, CENTER_MANAGER.
- `occupancy_reports` (export): ADMIN, OWNER, ACCOUNTS, MANAGER.

---

## 4. How the two stay consistent (Phase 1–2 reality)

Both currently track seat state from **different** sources, kept aligned by a one-way sync:
- `src/lib/occupancy/sync.ts` — `syncSeatStatus(seatId)` / `syncCenterSeatStatuses(centerId)`
  flip `Space.status` AVAILABLE↔OCCUPIED to match `Seat.occupied`. They **never** overwrite
  manual MAINTENANCE / BLOCKED / RESERVED.
- The sync helper is **not yet wired** into the legacy write paths (deferred to Phase 6);
  until then, re-run `node prisma/backfill-occupancy.mjs` to refresh `Space` status from seats.
- **End state:** after Phase 6, Occupancy owns the truth, the sync is deleted, and Seat Map
  is retired.

---

## 5. Glossary
- **Partial occupancy** — client holds a whole cabin but isn't using every seat (orange on Seat Map; drives half-price billing + upsell reminder).
- **Allocation vs Reservation** — allocation = real occupancy under (optional) agreement; reservation = temporary hold that auto-expires.
- **Agreement** — this system's `Contract` model (start/end/rent/deposit/revision).
- **Append-only history** — `OccupancyHistory`; the immutable audit trail of every space event.
