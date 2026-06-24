# Occupancy Tracking Module

Status: **in progress** — Phase 1 done, Phase 2 in progress.
Owner: ERP team. This doc is the source of truth for the module across sessions.

---

## 1. Goal

A unified "Space Occupancy Management" module: track every rentable space (seats, hot
desks, cabins, meeting rooms, offices) across centers, with allocations to clients,
reservations, transfers, full history, agreement/invoice integration, dashboard and
reports.

## 2. Key decisions (fitted to THIS codebase — not a greenfield)

The app already has `Center`, `Cabin`, `Seat`, `Client`, `Contract`, `MeetingRoom`,
`AuditLog` + `logAction()`, a real RBAC system (9 roles), and a read-only `/seatmap`.
The module **extends** these rather than replacing them.

| Topic | Decision | Why |
|---|---|---|
| Top of hierarchy | **No `Building` table** — one Center = one building; add `Floor`/`Zone` *under* Center | ~25 models are keyed on `centerId`; a Building level would ripple everywhere for no benefit |
| Floor / Zone | **Optional** (`floorId?`, `zoneId?`) | Works on current flat data day one; floors can be added per-center later |
| Seat ↔ Space truth | **Parallel + sync** to start (3b), migrate to Space-authoritative later | `Seat.occupied`/`Client.occupiedSeats` read+written in ~12 live files; rewriting now is high risk |
| Agreement | **Reuse `Contract`** (`Allocation.contractId → Contract`) | Contract already has start/end/rent/deposit/revision |
| Audit | **Reuse `AuditLog` + `logAction()`** | Established pattern |
| Reports export | **CSV + PDF now; XLSX deferred** | CSV/PDF need no new dep; XLSX would add `exceljs` |
| Cron | Plain `POST` route triggered like existing `run-monthly`/`run-reminders` | No scheduler config in repo; external crontab hits the URL |
| Architecture | Service layer in `src/lib/occupancy/` + App-Router pages + `route.ts` | The repo's idiom; a repositories/DTO/listeners framework would be foreign over-engineering |

### Seat Map vs Occupancy — convergence decision

`/seatmap` is a **read-only** glance off legacy `Seat.occupied` (3 states). Occupancy is
the management console over the new `Space` model (5 states + lifecycle). They overlap on
the visual grid only.

**Decision: Occupancy absorbs Seat Map.** In Phase 6 the interactive Occupancy map is
built as a *superset* of the seatmap; then `/seatmap` is **retired** (redirected into
Occupancy), the seat↔space sync is removed, and `Space` becomes the single source of truth.

## 3. Data model (Phase 1 — DONE)

Models added (additive migration `occupancy_module`):
`Floor`, `Zone`, `Space` (bridges to `Cabin`/`Seat`/`MeetingRoom` via optional FKs;
soft-delete via `deletedAt`; map coords `gridX/gridY`), `Allocation` (→ `Client` +
`Contract`), append-only `OccupancyHistory`, `Reservation`, `SpaceTransfer`.
Enums: `SpaceType`, `SpaceStatus`, `AllocationStatus`.

Status colors: 🟢 AVAILABLE · 🔴 OCCUPIED · 🟡 RESERVED · ⬜ MAINTENANCE · ⬛ BLOCKED.

Backfill: `prisma/backfill-occupancy.mjs` (idempotent) creates a `Space` per existing
Seat/Cabin/MeetingRoom and sets status from `Seat.occupied`. Re-run anytime to refresh.

Sync bridge: `src/lib/occupancy/sync.ts` — `syncSeatStatus(seatId)` /
`syncCenterSeatStatuses(centerId)`. Only flips AVAILABLE↔OCCUPIED; never overwrites
manual MAINTENANCE/BLOCKED/RESERVED.

## 4. RBAC (DONE)

`src/lib/rbac.ts` modules: `occupancy` (view), `occupancy_manage`
(create/edit/transfer/allocate), `occupancy_reports` (export). Sidebar item "🪑
Occupancy" in the Workspace group ([Shell.tsx]).

## 5. Phase plan

1. **Schema + migration + backfill + sync** — ✅ DONE
2. **Service layer** (`service.ts`, `validators.ts`, `events.ts`) — IN PROGRESS
3. **APIs** (spaces CRUD → allocations → reservations → transfers); backfill active-client
   Allocations *through* the allocate service
4. **Dashboard + reports** (read-only)
5. **Spaces table** (server-side filter + pagination)
6. **Interactive map** (superset of seatmap) — ✅ map built; `/seatmap` retired
   (redirects → `/occupancy/map`, sidebar item removed). **Sync kept** (NOT dropped):
   legacy `Seat.occupied` still drives invoicing/half-price/dashboard, so Space is not yet
   authoritative. Dropping the sync + making Space authoritative is deferred until those
   consumers are migrated (future phase). **Known gap:** per-seat "partial occupancy"
   (orange) from the old seatmap is not yet shown on the new map — maps to
   `Allocation.seatsTaken < capacity`; to add later.
7. **Cron** reservation auto-release + contract-expiry sweep
8. **RBAC wiring + audit verification + nav polish**

### Deferred (revisit at the noted phase)
- Wire `syncSeatStatus` into the 12 legacy write points → **Phase 6** (when Space.status is user-visible)
- Backfill `Allocation` from active clients → **Phase 3** (route through the allocate service for clean provenance)

## 6. Folder layout

```
src/lib/occupancy/        service.ts validators.ts events.ts sync.ts reports.ts dashboard.ts types.ts
src/app/(app)/occupancy/  page.tsx (overview→dashboard) spaces/ map/ reservations/ transfers/ reports/
src/app/api/occupancy/    spaces/ allocations/ reservations/ transfers/ dashboard/ reports/ cron/
```

## 7. Events (in-process, via events.ts → logAction)

`OccupancyAllocated`, `OccupancyReleased`, `OccupancyTransferred`, `ReservationCreated`,
`ReservationExpired`, `AgreementExpired`.

## 8. State rules

- Allocate: space must be AVAILABLE or RESERVED → becomes OCCUPIED; write `OccupancyHistory(ALLOCATED)`.
- Release: allocation → TERMINATED/EXPIRED; space → AVAILABLE; history(RELEASED|EXPIRED).
- Transfer: old allocation TRANSFERRED, new ACTIVE; `SpaceTransfer` row; history(TRANSFERRED).
- Reserve: space → RESERVED; cron releases past `expiresAt`.
- Contract expired → allocation EXPIRED → space AVAILABLE. Overdue invoice → computed warning flag (not stored).
- **Soft delete only**; history is append-only (never updated/deleted).
