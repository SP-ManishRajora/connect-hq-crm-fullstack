# CHANGELOG — Coworking ERP

This document tracks every functional change shipped via patch bundles.

---

## [0.6.0] — Patch v6 — Role-split center setup + Contracts Inbox + Bulk-Upload 404 fix

**Driven by:** "when a new center is added which can only be done by Admin by filling in basic details like number of seats etc, the detailed photograph upload of cabins, common area, seat map, inventory, seats occupied by filling in the clients shall be done by community manager and corresponding contracts can be uploaded by accounts team, bulk upload is showing 404 error."

### Added — Role-split center workflow
- **Admin creates centers (basic only).** `POST /api/centers` now accepts just `name`, `city`, `address`, `totalSeats`, `openSeats?`. The detailed cabin/photo/map setup is no longer accepted in this endpoint. Optionally creates open-seat rows so they're visible on the seat map.
- **Community Manager (or Admin/Owner) does detailed setup.** New `/centers/[id]/setup` page with tabs:
  - **Map & Common Areas** — upload floor map + multiple common-area photos. `PATCH /api/centers/[id]/setup`.
  - **Cabins** — add cabin type (name, capacity, qty) with photos. Auto-creates seats per cabin. `POST /api/centers/[id]/cabins`.
  - **Assign Cabins to Clients** — pick cabin + client + occupied count. Seats colour-code instantly (green = occupied, orange = unused/partial-occupancy). `POST /api/centers/[id]/assign-cabin`. `DELETE` to clear.
  - **Inventory** — add inventory items in-place (uses existing `/api/inventory`).
  - Access is restricted: ADMIN/OWNER for any center, CENTER_MANAGER only for their own assigned center (`User.centerId === params.id`). New helper `src/lib/center-access.ts`.
- **Centers list page** — shows a "Setup →" button visible to anyone who can manage that center.

### Added — Accounts Contracts Inbox
- `/contracts-inbox` page (ADMIN/OWNER/ACCOUNTS).
- Two sections: **Awaiting contract** (active clients with no contract file) and **On file**.
- One-click upload per client → calls `POST /api/clients/[id]/contract-upload` (already shipped in v2/v3) which runs OCR and creates the contract record. Renewals continue to use the per-client page's "Upload renewal" form.
- New RBAC module `contracts_inbox`.

### Fixed — Bulk client upload 404
The 404 was caused by missing files: patches v3/v5 introduced the bulk-upload module, but if any earlier patch wasn't applied the route handler was absent → Next.js returned 404 for `/api/clients/bulk-upload` (and/or `/clients/bulk`).
- **Re-shipped all bulk-upload files** in v6 so it is self-contained — applying this patch alone restores the feature even if v3/v5 were skipped:
  - `src/lib/excel.ts` (parser, more forgiving headers, optional Start Date, comma-tolerant numbers, template builder)
  - `src/app/api/clients/bulk-upload/route.ts` (POST/GET — `runtime=nodejs`, `maxDuration=60`, try/catch with helpful error hints)
  - `src/app/api/clients/bulk-upload/template/route.ts` (GET template .xlsx with Help sheet listing your existing centers)
  - `src/app/api/clients/bulk-upload/[id]/approve/route.ts` (Accounts approves; per-row failure reasons)
  - `src/app/(app)/clients/bulk/page.tsx` + `BulkClient.tsx` (upload UI, "Common causes" diagnostic panel)
  - `src/app/(app)/clients/bulk/[id]/page.tsx` + `BulkDetail.tsx` (review + approve/reject)
- Verified the route paths match Next.js App Router conventions: `app/(app)/clients/bulk/page.tsx` → URL `/clients/bulk` (static segment wins over `[id]`), `app/api/clients/bulk-upload/route.ts` → URL `/api/clients/bulk-upload`.

### RBAC modules added
- `contracts_inbox` (ADMIN/OWNER/ACCOUNTS).
- `centers` now also allows CENTER_MANAGER (so they can see the list and access Setup for their own center).

### Schema
- **No schema changes** in v6.

### Dependencies
- **No new dependencies**. `package.json` bumps version to 0.6.0.

### Migration
- No migration needed if you've applied v2-v5 correctly. If applying onto a stale install, run `npx prisma db push --force-reset && npx tsx prisma/seed.ts`.

---

## [0.5.0] — Patch v5 — SMTP (Zoho/nodemailer) + end-to-end leave management with hierarchy + bulk upload fixes
*(see prior entry)*

## [0.4.0] — Patch v4 — User invites, password reset (admin-approved), user transfer, GPS staff attendance, leave management
*(see prior entry)*

## [0.3.0] — Patch v3 — Bulk client onboarding + contract revisions
*(see prior entry)*

## [0.2.0] — Patch v2 — Cabins, employee directory, half-price seats, vendor invoice OCR
*(see prior entry)*

## [0.1.0] — Initial build
*(see prior entry)*
