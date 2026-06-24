# Feature Log — Requirements → Implementation

A running record of feature requirements and what was built for each. Newest first.
For module-deep design see the dedicated `*-module.md` docs; for the shipped-changes
changelog see [CHANGELOG.md](./CHANGELOG.md).

---

## Searchable category combobox (Inventory & Repairs)

**Requirement:** Category fields should be a search box with a dropdown that filters as you
type and offers an "Add" option when the typed text matches nothing. On opening the form,
show a non-selectable "Select category" prompt by default.

**Built:**
- New reusable component **`src/components/ComboBox.tsx`** — search input + filtered dropdown;
  click to select, Enter to commit, Esc/outside-click to revert; shows a green
  "+ Add '<text>'" row when no option matches (gated by an `allowAdd` prop).
- **Inventory → Consumables → Category** (`inventory/InventoryClient.tsx`): uses ComboBox; options
  = built-in defaults + categories already used by existing items; new categories save as free
  text (the `category` column is a plain string). Default empty → "Select category" placeholder.
- **Repairs → Log Repair → Category** (`repairs/RepairsClient.tsx`): uses ComboBox; categories are
  DB rows (`RepairCategory`), so adding a new one **persists via `POST /api/repair-categories`**
  and is **admin/owner-only** (`allowAdd={isAdmin}`); new category appears immediately. Default
  empty → "Select category" placeholder; required on submit.

---

## Occupancy Tracking Module (Phases 1–6)

**Requirement:** A complete space-occupancy management module — hierarchy, statuses, visual
map, allocations, reservations, transfers, history, dashboard, reports — fitted to the
existing codebase (Center/Cabin/Seat/Client/Contract/AuditLog/RBAC), not greenfield.

**Built (phase by phase):** see **[occupancy-module.md](./occupancy-module.md)** for the full
design, decisions, and phase status, and **[occupancy-and-seatmap-functionality.md](./occupancy-and-seatmap-functionality.md)**
for behavior/business rules. Summary:
- **P1** schema (`Floor/Zone/Space/Allocation/OccupancyHistory/Reservation/SpaceTransfer` + enums),
  migration, idempotent backfill, seat↔space sync helper, sidebar entry + RBAC modules, overview page.
- **P2** service layer (`service.ts` allocate/release/reserve/transfer, `validators.ts` Zod DTOs,
  `events.ts` in-process emitter → AuditLog).
- **P3** REST APIs (spaces CRUD, allocations, reservations, transfers) + allocation backfill via the service.
- **P4** dashboard KPIs + reports (occupancy/vacancy/utilization/client/revenue; CSV + print-PDF).
- **P5** spaces table UI (server-side filter + pagination + inline actions).
- **P6** interactive map (5-color legend, zoom, filter, click-to-act); **Seat Map retired**
  (`/seatmap` → redirect to `/occupancy/map`, sidebar item removed); sync intentionally kept
  (Space not yet authoritative — billing still reads `Seat.occupied`).
- Reserved spaces show the **held-for client** (initials on tile, name in tooltip + detail).
- RBAC: `occupancy` (view), `occupancy_manage`, `occupancy_reports` — CENTER_MANAGER included in all three.

**Deferred:** drop the sync / make Space authoritative (after billing migrates to Space);
per-seat "partial occupancy" on the new map; Phase 7 (reservation-expiry cron) and Phase 8 (RBAC/audit polish).

---

## Lead status — move to any stage with a comment

**Requirement:** Allow a lead's status to move to ANY status (not just next/previous), but
require a comment on every change.

**Built:** `src/lib/leadStatus.ts` — `allowedNextStatuses` returns every status except the
current; `canTransition` allows any known target. API (`api/leads/[id]/route.ts`) keeps the
comment-required gate; the status-change is logged as a `STATUS`-channel comment. Both the
table and detail UIs list all statuses.

## Lead comments — editable with full edit history

**Requirement:** Status/update comments should be editable, keeping a log of every version.

**Built:** `Comment` gained `editedAt/editedById` + a new append-only **`CommentEdit`** table
(prev body, editor, timestamp). `PATCH/DELETE /api/leads/[id]/comments/[commentId]` snapshots
the prior body before each edit. LeadDetail shows inline edit + a "History (n)" toggle.

## Proposals — send/resend with editable email composer

**Requirement:** Sending/resending a proposal opens an email composer (editable subject +
body preview) with the recipient auto-populated/editable; confirm before sending; allow resend;
show a "sent" mark. Use a formatted SweetAlert.

**Built:**
- Real email sending via SMTP moved to **`src/lib/mail.ts`** (server-only; nodemailer kept out
  of the client bundle — fixed an `fs`-in-client build error). Falls back to console when SMTP unset.
- Send route `GET` returns default subject/body; `POST` accepts edited subject/body + an
  "include proposal link" toggle, validates the recipient, persists a changed email to the lead.
- Composer modal (recipient/subject/body/link checkbox) replaces the instant send; **Resend**
  available on SENT proposals; "✓ Sent <when> to <whom>" shown on the row + drawer; SweetAlert2
  result dialogs.

## Proposal PDF — edit, print, save, consistent font & logo

**Requirement:** Let users edit the proposal PDF content and print; use one industry-standard
font; show the logo; aesthetic photos under "Membership Details" when a proposal has none.

**Built:** `api/proposals/[id]/pdf` gained `?edit=1` (editable fields + Save/Print toolbar);
`POST` persists DB-backed fields and writes an HTML snapshot (`Proposal.pdfSnapshot`). Template
unified to Helvetica/Arial; logo moved to `public/logo.png` and referenced absolutely; the
template's default photo gallery is kept when a proposal has no images of its own; missing
image files are skipped at render time (+ dangling DB references cleaned).
