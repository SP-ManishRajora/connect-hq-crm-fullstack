# Coworking ERP

Multi-center ERP for a co-working business. Full-stack web app — **Next.js 14 (App Router) + Prisma + SQLite + Tailwind CSS + SheetJS + nodemailer**. Mobile-responsive.

> 📜 See **[CHANGES.md](./CHANGES.md)** for the per-patch changelog.

## Role-split center setup (v6)

| Step | Done by | Where |
|------|---------|-------|
| 1. Create the center (basic: name / city / address / total seats / optional open seats) | **Admin** | `/centers` → **+ Add Center (basic)** |
| 2. Upload floor map, common-area photos | **Community Manager** (or Admin/Owner) | `/centers/[id]/setup` → **Map & Common Areas** |
| 3. Add cabins with photos (name, capacity, qty — seats auto-created) | **Community Manager** | `/centers/[id]/setup` → **Cabins** |
| 4. Assign cabins to onboarded clients (seats colour-code green/orange) | **Community Manager** | `/centers/[id]/setup` → **Assign Cabins to Clients** |
| 5. Add tea/coffee/housekeeping inventory items | **Community Manager** | `/centers/[id]/setup` → **Inventory** |
| 6. Upload signed contract PDFs once clients onboarded | **Accounts** | `/contracts-inbox` |
| 7. Yearly contract renewal (archives old to revisions) | **Accounts / Admin** | each client's page → **Upload renewal** |

CENTER_MANAGER users can only setup their own center (`User.centerId === center.id`); Admin/Owner can setup any.

## Modules

- **Auth + RBAC** with 9 roles + per-user module override (custom whitelist on a User)
- **User invites** with email link; **password reset** with admin approval
- **User transfer** (admin reassigns open work to another user, full audit)
- **Reporting hierarchy** + **end-to-end leave management** (policies, balances, half-day, escalation, cancel/refund, email at every step)
- **GPS staff attendance** (browser geolocation)
- **CRM, Visitors, Proposals (cabin pics auto-attach), Onboarding, Bulk Onboarding (Excel + Accounts approval), Contracts Inbox + Renewals + Audit Revisions, Procurement (PR → PO → PI → Invoice), Vendor Invoices (OCR + PO match + approval), Vendors (blacklist with remarks), Inventory & Assets, Repairs, Recurring POs, Client Invoicing (half-price unused seats + meeting-room overage + GST), Meeting Rooms (with 2hr/seat/month quota), Client Portal & QR, Notice Board & Ads, Referrals, Accounts (ledger + petty cash + GST + TDS + Cashflow CSV), SOPs, Center Daily Logs, Centers (basic create + CM setup), Seat Map (color-coded)** — see CHANGES.md.

## Quick start

```bash
npm install
cp .env.example .env
npm run db:reset
npm run dev
```

Open <http://localhost:3000>.

## Zoho SMTP setup (v5)

```
SMTP_HOST="smtp.zoho.in"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="<app-specific password>"
SMTP_FROM="Coworking ERP <noreply@yourdomain.com>"
```

Test: `GET /api/admin/test-smtp` (verify), `POST /api/admin/test-smtp { to: "you@…" }` (send test).

## Bulk client upload — troubleshooting

If you see a 404 or any error:

1. **Confirm the files are in place.** Each of these must exist after copying the patch:
   ```
   src/app/(app)/clients/bulk/page.tsx
   src/app/(app)/clients/bulk/BulkClient.tsx
   src/app/(app)/clients/bulk/[id]/page.tsx
   src/app/(app)/clients/bulk/[id]/BulkDetail.tsx
   src/app/api/clients/bulk-upload/route.ts
   src/app/api/clients/bulk-upload/template/route.ts
   src/app/api/clients/bulk-upload/[id]/approve/route.ts
   src/lib/excel.ts
   ```
2. **Clear Next.js cache:** `rm -rf .next` then `npm run dev`.
3. **Run `npm install`** — `xlsx` was introduced in v3.
4. **Run `npx prisma db push --force-reset && npx tsx prisma/seed.ts`** if your DB doesn't have the `BulkClientImport` table.
5. **Headers in Excel** are case-insensitive; common aliases are accepted (`Email ID`, `Centre Name`, `No of seats`, `From Date`, etc.).
6. **Start Date** is optional (defaults to today on approval).
7. **Numeric cells** can contain commas.

The UI now surfaces the server's exact error reason with a collapsible "Common causes" panel.

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@erp.com | admin123 |
| Owner | owner@erp.com | owner123 |
| Manager | manager@erp.com | manager123 |
| Sales | sales@erp.com | sales123 |
| Ops | ops@erp.com | ops123 |
| Center Manager | cm@erp.com | cm123 |
| Accounts | accounts@erp.com | accounts123 |
| IT | it@erp.com | it123 |
| Client | client@erp.com | client123 |

## Cron / scheduled endpoints

| Endpoint | Frequency | Purpose |
|----------|-----------|---------|
| `POST /api/contracts/run-reminders` | daily | email Accounts about contract revisions due in <30 days |
| `POST /api/invoices/run-monthly` | 1st of month | generate client invoices |
| `POST /api/clients/run-occupancy-reminders` | weekly | flag partial-occupancy clients to Sales |
| `POST /api/po/run-recurring` | daily | clone recurring POs |

## Tech notes

- DB: SQLite for dev; swap `DATABASE_URL` to Postgres for prod.
- Excel: `xlsx@^0.20.3` (SheetJS) — pure JS.
- Email: `nodemailer@^6.9.16`.
- OCR: `src/lib/ocr.ts` stubs.
- Geolocation: browser `navigator.geolocation`.
- Tokens: Node `crypto.randomBytes(32)`.
# connect-hq-crm-fullstack
