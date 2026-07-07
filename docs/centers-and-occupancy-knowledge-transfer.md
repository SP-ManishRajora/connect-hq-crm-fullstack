# Centers & Occupancy — Knowledge Transfer Guide

> **Audience:** New joiners / teammates picking up the Centers and Occupancy modules.
> **Goal:** Understand what every feature does, how the data flows, which roles can do what, and where the code lives — without having to reverse-engineer it.
> **Last verified against code:** 2026-07-07.

---

## 1. The Big Picture

The product manages **physical coworking space**. There are two connected modules:

| Module | Answers the question | Who owns it day-to-day |
|--------|----------------------|------------------------|
| **Centers** | *"What buildings do we have, and how are they physically laid out?"* (floors, cabins, seats, photos, floor maps) | Admin creates the shell; **Center Manager** builds out the physical setup |
| **Occupancy** | *"Who is sitting where, right now — and what's free?"* (allocate / reserve / transfer / release seats, dashboards, reports) | Center Manager / Manager / Admin |

**Mental model:** *Centers* is the **inventory setup** (create the rooms and seats). *Occupancy* is the **live operations** layer on top of that inventory (assign those seats to clients and track them over time).

The two modules connect through the **`Space`** record — see §5.

---

## 2. Roles & Permissions (read this first)

Access is controlled in [`src/lib/rbac.ts`](../src/lib/rbac.ts) (which module a role can open) and enforced again in each API route (what they can actually do).

### Module-level access (`MODULE_ACCESS`)

| Module key | Roles allowed |
|------------|---------------|
| `centers` | ADMIN, OWNER, CENTER_MANAGER |
| `occupancy` (view) | ADMIN, OWNER, MANAGER, CENTER_MANAGER, SALES, ACCOUNTS |
| `occupancy_manage` (allocate/edit/transfer) | ADMIN, OWNER, MANAGER, CENTER_MANAGER |
| `occupancy_reports` | ADMIN, OWNER, ACCOUNTS, MANAGER, CENTER_MANAGER |

### Occupancy API roles ([`src/lib/occupancy/route-helpers.ts`](../src/lib/occupancy/route-helpers.ts))

- `VIEW_ROLES` = ADMIN, OWNER, MANAGER, CENTER_MANAGER, SALES, ACCOUNTS → can **read** occupancy data.
- `MANAGE_ROLES` = ADMIN, OWNER, MANAGER, CENTER_MANAGER → can **mutate** (allocate, reserve, transfer, release, edit spaces).

### Center management ([`src/lib/center-access.ts`](../src/lib/center-access.ts))

`canManageCenter(user, centerId)` gates the setup/cabins/floors/assign-cabin routes. **Current behaviour:** ADMIN, OWNER, and **CENTER_MANAGER** can manage **any** center. Create / edit / delete of the center record itself ([`/api/centers`](../src/app/api/centers/route.ts), [`/api/centers/[id]`](../src/app/api/centers/[id]/route.ts)) is allowed for ADMIN, OWNER, CENTER_MANAGER.

> ⚠️ **Note for maintainers:** the RBAC comment `// CM can see list but only setup their own` on the `centers:` line is **stale** — CM was granted full center access. Trust the code, not that comment.

**Rule of thumb:** if a button is missing in the UI, it's almost always a role gate. Check the `canManage` / `isAdmin` flag passed into the client component, and the matching role list in the API route.

---

## 3. Centers Module

### 3.1 Where it lives

| Purpose | File |
|---------|------|
| Centers list page (server) | [`src/app/(app)/centers/page.tsx`](../src/app/(app)/centers/page.tsx) |
| Centers list UI (client) | [`src/app/(app)/centers/CentersClient.tsx`](../src/app/(app)/centers/CentersClient.tsx) |
| Center setup page + UI | [`src/app/(app)/centers/[id]/setup/`](../src/app/(app)/centers/[id]/setup/) |
| Create / list centers API | [`src/app/api/centers/route.ts`](../src/app/api/centers/route.ts) |
| Edit / delete a center API | [`src/app/api/centers/[id]/route.ts`](../src/app/api/centers/[id]/route.ts) |
| Setup (floor map + photos) | [`src/app/api/centers/[id]/setup/route.ts`](../src/app/api/centers/[id]/setup/route.ts) |
| Cabins (create + auto-seats) | [`src/app/api/centers/[id]/cabins/route.ts`](../src/app/api/centers/[id]/cabins/route.ts) |
| Floors (with plan images) | [`src/app/api/centers/[id]/floors/route.ts`](../src/app/api/centers/[id]/floors/route.ts) |
| Assign a client to a cabin | [`src/app/api/centers/[id]/assign-cabin/route.ts`](../src/app/api/centers/[id]/assign-cabin/route.ts) |
| Public center info (QR portal) | [`src/app/api/centers/public/route.ts`](../src/app/api/centers/public/route.ts) |

### 3.2 The intended workflow

1. **Admin creates the basic center record** — name, city, address, and **`totalSeats`** (the hard cap on how many seats can exist in this center). Button: *+ Add Center (basic)*.
2. **Center Manager opens the center's *Setup* page** and builds out the physical layout:
   - Upload the **digital floor map** and **common-area photos**.
   - Add **floors** (each needs a name + at least one floor-plan image).
   - Add **cabins** (see auto-seat logic below).
   - **Assign clients to cabins** and mark how many seats they occupy.
3. Accounts uploads contracts via the **Contracts Inbox** (separate module).

### 3.3 Key behaviours to understand

**Cabins auto-create seats.** When you POST to `.../cabins` with `{ name, capacity, qty }`:
- It creates `qty` cabins named `"<name> 1"`, `"<name> 2"`, …
- Each cabin gets `capacity` **Seat** rows auto-created (numbered `S1`, `S2`, …).
- **Guardrail:** it refuses if `existing seats + new seats > center.totalSeats`. So `totalSeats` is a real budget — raise it on the center first if you need more.

**Assigning a client to a cabin** (`.../assign-cabin`, body `{ cabinId, clientId, occupiedSeats }`) colours the seats:
- First `occupiedSeats` seats → `occupied = true` (green).
- Remaining seats in that cabin → `partialOccupancy = true` (orange — "client took the cabin but not this seat").
- Updates the `Client` record with `cabinId`, `occupiedSeats`, `totalCabinSeats`.

**Deleting a center** is blocked if it still has active clients — deactivate them first (returns a 400 with that message).

**Photos & map images** are stored as **JSON arrays of file paths** in text columns (`commonAreaPhotos`, `Floor.planImages`, `Cabin.photos`), not as separate rows.

---

## 4. Occupancy Module

The occupancy module is the operational heart. It's built as **API routes → validators (Zod) → service layer → events/history**. Understanding that pipeline is the fastest way to become productive.

### 4.1 Architecture (how a request flows)

```
UI (client component)
  → POST /api/occupancy/<action>
    → requireUser(MANAGE_ROLES)         // auth + role guard   (route-helpers.ts)
    → parseBody(<zodSchema>, body)      // validation          (validators.ts)
    → service function                  // business rules + DB  (service.ts)
        ├─ prisma.$transaction(...)     // atomic multi-write
        ├─ writes OccupancyHistory row  // audit trail
        └─ emit(<event>)                // side-effects/audit   (events.ts)
    → JSON response
```

Everything mutating goes through [`src/lib/occupancy/service.ts`](../src/lib/occupancy/service.ts). **If you need to change allocation/transfer/release logic, that's the file** — not the routes (the routes are thin).

### 4.2 The four core operations

| Operation | Endpoint | What it does | Space status change |
|-----------|----------|--------------|---------------------|
| **Allocate** | `POST /api/occupancy/allocations` | Assign one **or many** spaces to **one** client. Bulk-capable via `items[]`. | AVAILABLE/RESERVED → **OCCUPIED** |
| **Reserve** | `POST /api/occupancy/reservations` | Temporarily hold a space (optionally for a client) until `expiresAt`. | AVAILABLE → **RESERVED** |
| **Transfer** | `POST /api/occupancy/transfers` | Move a space's active allocation from its current client to another. Bulk-capable. | stays **OCCUPIED**, new client |
| **Release** | `DELETE /api/occupancy/allocations/[id]` | End an active allocation, freeing the space. | OCCUPIED → **AVAILABLE** |

**Bulk / multi-select:** `allocate` and `transfer` accept an `items: [{ spaceId, seatsTaken }]` array, so several seats can be assigned to a single client in one atomic request. The occupancy **map** UI exposes this via *Multi-select seats* mode (select several available tiles → allocate all to one client).

**Important guards in the service layer:**
- You can only allocate a space that is AVAILABLE or RESERVED (else `409`).
- `seatsTaken` cannot exceed the space's `capacity` (else `400`).
- Release only works on an `ACTIVE` allocation.
- Reserve only works on an AVAILABLE space, and `expiresAt` must be in the future.

### 4.3 Spaces (the seat inventory)

| Purpose | File |
|---------|------|
| Spaces table page | [`src/app/(app)/occupancy/spaces/`](../src/app/(app)/occupancy/spaces/) |
| List / create spaces API | [`src/app/api/occupancy/spaces/route.ts`](../src/app/api/occupancy/spaces/route.ts) |
| Edit / delete one space | [`src/app/api/occupancy/spaces/[id]/route.ts`](../src/app/api/occupancy/spaces/[id]/route.ts) |

- **Space types:** `DEDICATED_SEAT`, `HOT_DESK`, `CABIN`, `MEETING_ROOM`, `PRIVATE_OFFICE`, `VIRTUAL_OFFICE`.
- **Space statuses:** `AVAILABLE`, `OCCUPIED`, `RESERVED`, `MAINTENANCE`, `BLOCKED`.
- **Editing a space** (`PUT`): you can change `name`, **`capacity`** (seat capacity — editable from the Spaces table's *Capacity* action), `floorId`, `zoneId`, grid coords, and set `MAINTENANCE`/`BLOCKED`/`AVAILABLE`. You **cannot** flip an OCCUPIED/RESERVED space straight to MAINTENANCE/BLOCKED — release it first (`409`).
- **Deleting a space is a soft delete** (`deletedAt` is set; the row is never physically removed, so history is preserved). Occupied spaces can't be deleted until released.

### 4.4 The Occupancy Map (visual view)

| File | Role |
|------|------|
| [`src/app/(app)/occupancy/map/MapClient.tsx`](../src/app/(app)/occupancy/map/MapClient.tsx) | The grid UI |
| [`src/app/api/occupancy/map/route.ts`](../src/app/api/occupancy/map/route.ts) | Returns ALL matching spaces (no pagination, 5000 cap), grouped by center |

- Colour-coded tiles by status (green=available, red=occupied, amber=reserved, grey=maintenance, black=blocked).
- Click a tile → detail + contextual actions (allocate / reserve / transfer / release / maintenance / block) based on its current status and whether you're a manager.
- Filters: center, type, status, text search. Zoom control for large centers.
- Reserved/occupied tiles show the holding client's **initials**.

### 4.5 Dashboard (KPIs)

[`src/lib/occupancy/dashboard.ts`](../src/lib/occupancy/dashboard.ts) → `getOccupancyKpis(centerId?)`, surfaced at [`/api/occupancy/dashboard`](../src/app/api/occupancy/dashboard/route.ts) and the [`/occupancy`](../src/app/(app)/occupancy/page.tsx) page.

Returns (optionally scoped to one center): totals, counts by status & type, **occupancy %** and **vacancy %**, **upcoming vacancies** (active allocations ending within 30 days), **expiring agreements** (contracts ending within 30 days), **monthly revenue** (sum of `monthlyRent` across active-allocation contracts), **revenue per seat**, and **overdue clients**.

### 4.6 Reports

[`src/lib/occupancy/reports.ts`](../src/lib/occupancy/reports.ts) → `buildReport(type, centerId?)`, exported via [`/api/occupancy/reports`](../src/app/api/occupancy/reports/route.ts). Five report types:

| Type | Content |
|------|---------|
| `occupancy` | Per-center: total / occupied / available / reserved / occupancy% |
| `vacancy` | The vacant inventory (available + reserved spaces) |
| `utilization` | Per-center utilization % |
| `client-occupancy` | Per active allocation: client, space, dates |
| `revenue` | Per-center monthly revenue from active-allocation contracts |

Reports can be exported to **CSV** (`toCSV`) or **printable HTML** (`toPrintableHTML`).

---

## 5. Data Model — how the pieces connect

```
Center ──< Floor ──< Zone
   │          │
   ├──< Cabin ──< Seat
   │
   └──< Space ──< Allocation ──< OccupancyHistory
             ├──< Reservation
             └──< SpaceTransfer
```

**The `Space` is the bridge.** A `Space` belongs to a `Center` (and optionally a `Floor`/`Zone`), and can optionally point at an existing `Cabin`, `Seat`, or `MeetingRoom`. Occupancy operates on `Space` rows; the physical setup (from the Centers module) produces the `Cabin`/`Seat`/`Floor` rows that Spaces can reference.

Key models ([`prisma/schema.prisma`](../prisma/schema.prisma)):

- **`Center`** — `name`, `city`, `totalSeats` (seat budget), `mapImagePath`, `commonAreaPhotos`, `active`.
- **`Floor`** — `name`, `level` (ordering), `planImages` (JSON, ≥1 required). Unique per `(centerId, level)`.
- **`Cabin`** — `name`, `capacity` (seats inside), `photos`.
- **`Seat`** — `number`, `occupied`, `partialOccupancy` (orange), `assignedClientId`.
- **`Space`** — `code`, `type`, `capacity`, `status`; soft-deletable (`deletedAt`).
- **`Allocation`** — links a `Space` to a `Client` (optionally a `Contract`), `seatsTaken`, `startDate`/`endDate`, `status` (ACTIVE/EXPIRED/TERMINATED/TRANSFERRED). Soft-deletable.
- **`Reservation`** — temporary hold on a Space, `expiresAt`, `released` (a cron flips this on expiry).
- **`SpaceTransfer`** — audit row for a client-to-client move; `batchId` groups a bulk transfer.
- **`OccupancyHistory`** — append-only event log (`ALLOCATED`/`RELEASED`/`TRANSFERRED`/`EXPIRED`/`RESERVED`/…) with a JSON `meta` snapshot. **This is the source of truth for "what happened".**

---

## 6. Auditing & History

There are **two** audit trails to be aware of:

1. **`OccupancyHistory`** — written inside every service transaction. This is the domain-specific, immutable trail of allocate/release/transfer/reserve events. Query this to reconstruct a space's or client's timeline.
2. **`AuditLog`** (global, via `logAction`) — cross-module log surfaced on the **Audit Log** page (`/audit-logs`, ADMIN/OWNER only). Space edits are logged here as `SPACE_STATUS_CHANGED` and `SPACE_CAPACITY_CHANGED`; deletes as `SPACE_DELETED`.

---

## 7. Common tasks — quick recipes

- **"Add a new center"** → Centers page → *+ Add Center (basic)* (Admin/Owner/CM). Set `totalSeats`.
- **"Lay out a center's rooms"** → open the center → *Setup* → add floors, then cabins (auto-creates seats up to `totalSeats`).
- **"Give a client seats"** → Occupancy → Map or Spaces → *Allocate* (pick client + dates). For several seats at once, use the map's **Multi-select** mode.
- **"Hold a seat for a prospect"** → *Reserve* with an expiry date.
- **"Move a client to another desk / swap clients"** → *Transfer*.
- **"Free up a seat"** → *Release* on the occupied space.
- **"Change how many people a room seats"** → Spaces table → *Capacity* action (edits `Space.capacity`).
- **"See how full we are"** → Occupancy dashboard (occupancy %, revenue, expiring agreements).
- **"Export occupancy/revenue for finance"** → Occupancy → Reports → pick type → CSV/print.

---

## 8. Gotchas & things that will bite you

- **`totalSeats` is a hard budget.** Cabin creation fails if it would exceed it. Bump the center's `totalSeats` first.
- **Soft deletes everywhere in occupancy.** Spaces and allocations set `deletedAt` rather than deleting. Always filter `deletedAt: null` in new queries (the existing code does).
- **Status transitions are owned by the service.** Don't set a Space to OCCUPIED/RESERVED by hand via the space `PUT` — that path only allows AVAILABLE/MAINTENANCE/BLOCKED. Use allocate/reserve/release so history and allocation rows stay consistent.
- **The stale RBAC comment** on `centers:` (see §2) — CM has full access now.
- **Reservations auto-expire via a cron** that flips `released = true`; don't assume a RESERVED space stays reserved forever.
- **Deploy discipline:** changes to any API route only take effect after a full rebuild + restart on the server (`rm -rf .next && npm run build && pm2 restart coworking-erp`). A stale build shows up as `ChunkLoadError` / "Application error" in the browser.

---

## 9. Related existing docs

- [`docs/occupancy-module.md`](occupancy-module.md)
- [`docs/occupancy-and-seatmap-functionality.md`](occupancy-and-seatmap-functionality.md)
- [`docs/project-documentation.md`](project-documentation.md)
