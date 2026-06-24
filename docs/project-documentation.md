# Coworking ERP — Complete Project Documentation

---

## Table of Contents

1. [Project Scope](#1-project-scope)
2. [Project Architecture](#2-project-architecture)
3. [Folder & File Structure](#3-folder--file-structure)
4. [Function Logic & Data Flow](#4-function-logic--data-flow)
5. [Best Practices & Suggestions](#5-best-practices--suggestions)
6. [How Everything Connects](#6-how-everything-connects)

---

## 1. Project Scope

### What is this project?

This is a **full-stack ERP (Enterprise Resource Planning) system** built for managing one or more coworking spaces. Think of it as an all-in-one internal tool that handles everything from the moment a potential customer first contacts you, all the way through billing, operations, staff attendance, and support.

### Who uses it?

| Role | What they do |
|---|---|
| **ADMIN / OWNER** | Full access to everything |
| **MANAGER** | Approvals, oversight |
| **SALES** | Leads, proposals, onboarding clients |
| **OPS** | Vendors, procurement, inventory, repairs |
| **CENTER_MANAGER** | Manage a specific center location |
| **ACCOUNTS** | Invoices, expenses, cashflow |
| **IT** | Users, tickets, SOPs |
| **CLIENT** | View their own invoices and submit tickets |

### Key Features

- **CRM Pipeline**: Capture leads → schedule tours → send proposals → onboard clients
- **Multi-center seat management**: Visual seat maps, cabin assignments, occupancy tracking
- **Contracts & billing**: Upload contracts (with OCR parsing), generate monthly invoices with GST
- **Procurement**: Raise purchase requests → create purchase orders → receive vendor invoices → approve
- **Inventory & assets**: Track stock levels, fixed assets, maintenance tickets
- **People management**: Staff attendance check-in/check-out, leave requests
- **Finance**: Expense ledger, cashflow reports, referral payouts
- **Client portal**: Clients log in to see their own invoices and raise support tickets

---

## 2. Project Architecture

### The Big Picture

```
Browser (React/Next.js)
        │
        ▼
   Next.js Server
   ┌─────────────────────────────────────────────┐
   │  Middleware (JWT check on every request)     │
   │                                             │
   │  Pages (Server Components)                  │
   │   └─ fetch data from Prisma directly        │
   │   └─ pass data to Client Components         │
   │                                             │
   │  API Routes (/api/...)                      │
   │   └─ validate session                       │
   │   └─ read/write database via Prisma         │
   │   └─ return JSON                            │
   └─────────────────────────────────────────────┘
        │
        ▼
   MySQL Database (via Prisma ORM)
```

### What is Next.js "App Router"?

Next.js 14 uses a folder-based routing system. Every folder inside `src/app/` becomes a URL path:

```
src/app/(app)/leads/page.tsx   →  yoursite.com/leads
src/app/(app)/clients/page.tsx →  yoursite.com/clients
src/app/login/page.tsx         →  yoursite.com/login
src/app/api/leads/route.ts     →  yoursite.com/api/leads  (API endpoint)
```

### The Two-Component Pattern

Almost every feature uses **two files**:

| File | Type | Role |
|---|---|---|
| `page.tsx` | **Server Component** | Runs on the server, fetches data from the DB directly |
| `XyzClient.tsx` | **Client Component** | Runs in the browser, handles forms, filtering, button clicks |

**Why?** Server components are faster (no API call needed — they query the DB directly). Client components handle interactivity that needs JavaScript in the browser.

**Example — Leads feature:**
```
page.tsx          → queries the DB with Prisma, passes data as props
LeadsClient.tsx   → renders the table, filter controls, the "Add Lead" form
```

### Key Libraries

| Library | Version | Purpose |
|---|---|---|
| **Next.js** | 14.2.15 | React framework (routing, SSR, API routes) |
| **Prisma** | 5.22.0 | ORM — talk to MySQL in TypeScript |
| **bcryptjs** | 2.4.3 | Hash and verify passwords |
| **jose** | 5.9.6 | Create and verify JWT tokens |
| **nodemailer** | 6.9.16 | Send emails (currently a stub) |
| **xlsx** | 0.18.5 | Export data to Excel |
| **zod** | 3.23.8 | Schema/input validation |
| **Tailwind CSS** | 3.4.13 | Utility-first CSS styling |

---

## 3. Folder & File Structure

```
coworking-erp/
│
├── prisma/
│   ├── schema.prisma        ← Database table definitions (28 models)
│   ├── seed.ts              ← Sample data for development
│   └── migrations/          ← History of DB schema changes
│
├── public/
│   └── uploads/             ← Uploaded files (contracts, vendor invoices)
│
├── src/
│   ├── middleware.ts         ← Runs before EVERY request — checks login cookie
│   │
│   ├── app/
│   │   ├── layout.tsx        ← HTML shell (<html><body>) for the whole site
│   │   ├── page.tsx          ← Root "/" — redirects to /dashboard
│   │   │
│   │   ├── login/            ← Public login page
│   │   ├── lead-form/        ← Public form for website visitors to submit leads
│   │   ├── qr/[centerId]/    ← QR code check-in page for center visitors
│   │   │
│   │   ├── api/              ← All backend API endpoints (64 routes)
│   │   │   ├── auth/         ← login, logout, who-am-I
│   │   │   ├── leads/        ← CRUD for leads + comments
│   │   │   ├── clients/      ← CRUD + onboarding + contract upload
│   │   │   ├── proposals/    ← Create, approve, send, accept
│   │   │   ├── contracts/    ← Reminders (cron), revisions
│   │   │   ├── vendors/      ← Vendor management + blacklist
│   │   │   ├── procurement/  ← Purchase request and order workflows
│   │   │   ├── vendor-invoices/ ← Upload + OCR + PO matching + approve
│   │   │   ├── inventory/    ← Stock tracking + consume
│   │   │   ├── assets/       ← Fixed asset management
│   │   │   ├── repairs/      ← Maintenance ticket workflow
│   │   │   ├── invoices/     ← Monthly billing cron
│   │   │   ├── attendance/   ← Center daily checklist
│   │   │   ├── staff-attendance/ ← Staff check-in/check-out
│   │   │   ├── my-attendance/    ← Personal attendance log
│   │   │   ├── leave-requests/   ← Leave approval workflow
│   │   │   ├── bookings/     ← Meeting room bookings
│   │   │   ├── meeting-rooms/← Meeting room CRUD
│   │   │   ├── tickets/      ← Client support tickets
│   │   │   ├── notices/      ← Notice board & ads
│   │   │   ├── referrals/    ← Referral tracking & payout
│   │   │   ├── expenses/     ← Operational expenses
│   │   │   ├── cashflow/     ← CSV export (admin only)
│   │   │   ├── sops/         ← Standard operating procedures
│   │   │   ├── feedback/     ← Client feedback
│   │   │   ├── visitors/     ← Visitor + KYC management
│   │   │   ├── centers/      ← Center CRUD + cabin/seat setup
│   │   │   └── upload/       ← Generic file upload handler
│   │   │
│   │   └── (app)/            ← All PROTECTED pages (require login)
│   │       ├── layout.tsx    ← Wraps every page with the sidebar (Shell)
│   │       │
│   │       ├── dashboard/    ← KPI cards + seat occupancy by center
│   │       ├── seatmap/      ← Visual seat map with occupancy colours
│   │       │
│   │       ├── leads/        ← Lead list + detail page
│   │       │   ├── page.tsx
│   │       │   ├── LeadsClient.tsx
│   │       │   └── [id]/     ← Dynamic route: /leads/abc123
│   │       │
│   │       ├── visitors/
│   │       ├── proposals/
│   │       ├── clients/      ← Client list + detail page
│   │       ├── contracts/
│   │       ├── contracts-inbox/
│   │       ├── centers/      ← Center list + setup page
│   │       ├── vendors/
│   │       ├── vendor-invoices/
│   │       ├── procurement/
│   │       ├── recurring/
│   │       ├── inventory/
│   │       ├── repairs/
│   │       ├── bookings/
│   │       ├── attendance/
│   │       ├── staff-attendance/
│   │       ├── my-attendance/
│   │       ├── leave-management/
│   │       ├── invoices/
│   │       ├── accounts/
│   │       │   └── cashflow/
│   │       ├── tickets/
│   │       ├── notices/
│   │       ├── referrals/
│   │       ├── sops/
│   │       ├── users/
│   │       └── client-portal/  ← Dashboard for CLIENT role users
│   │
│   ├── components/
│   │   └── Shell.tsx         ← Sidebar + top nav shown on every protected page
│   │
│   └── lib/
│       ├── auth.ts           ← JWT create/verify, login, session helpers
│       ├── db.ts             ← Prisma database client (singleton)
│       ├── rbac.ts           ← Role-based access control rules
│       ├── center-access.ts  ← Can this user manage this specific center?
│       ├── ocr.ts            ← OCR stub (reads invoice/contract images)
│       └── utils.ts          ← Shared helpers: format money, dates, send email
│
├── .env                      ← Secret config (DB password, JWT secret, SMTP)
├── .env.example              ← Template for .env (safe to commit)
├── package.json              ← Project dependencies and scripts
├── prisma/schema.prisma      ← Single source of truth for the database
├── tailwind.config.ts        ← Custom brand colours
└── tsconfig.json             ← TypeScript settings
```

### What does the `(app)` parenthesis mean?

The `(app)` folder is a **Route Group** in Next.js. Parentheses tell Next.js: *"group these pages together but don't include this folder name in the URL."* It exists only to apply the shared sidebar layout to all protected pages.

```
(app)/leads/page.tsx   →  /leads    ✓  (NOT /app/leads)
(app)/clients/page.tsx →  /clients  ✓
```

### What does `[id]` in a folder name mean?

Square brackets create a **Dynamic Route** — a page that accepts a variable segment in the URL:

```
(app)/leads/[id]/page.tsx  →  /leads/any-lead-id-here
(app)/centers/[id]/setup/  →  /centers/any-center-id/setup
```

Inside that page, `params.id` gives you the actual value from the URL.

---

## 4. Function Logic & Data Flow

### How a page loads (example: Leads page)

```
1. User visits /leads in their browser
2. src/middleware.ts reads the "erp_session" cookie
3. JWT is verified — if missing or invalid → redirect to /login
4. src/app/(app)/leads/page.tsx runs ON THE SERVER:
   → calls prisma.lead.findMany()  (direct DB query, no HTTP needed)
   → passes results as props to <LeadsClient>
5. LeadsClient.tsx renders IN THE BROWSER:
   → shows the table of leads
   → handles the "Add Lead" button click
6. When user submits the Add Lead form:
   → fetch("POST /api/leads", { body: formData })
7. src/app/api/leads/route.ts runs ON THE SERVER:
   → calls getSessionUser() to re-verify auth
   → calls prisma.lead.create({ data: formData })
   → returns JSON response
8. LeadsClient receives the response and calls router.refresh()
   → Next.js re-runs the server component, fresh data appears
```

### Authentication Flow

```
LOGIN
  User submits email + password
    → POST /api/auth/login
    → verifyPassword(input, storedHash)  [bcryptjs compare]
    → if valid: createSession(user)
        → signs a JWT with user id, role, email
        → sets HttpOnly cookie "erp_session" (7 day expiry)
    → redirects CLIENT role → /client-portal
    → redirects all others → /dashboard

EVERY SUBSEQUENT REQUEST
  → middleware.ts intercepts BEFORE the page loads
  → reads "erp_session" cookie
  → verifyToken(cookie) — checks JWT signature and expiry
  → if invalid → redirect to /login
  → if valid → continue to the page

LOGOUT
  → POST /api/auth/logout
  → destroySession() clears the cookie
  → redirects to /login
```

**Why does auth get checked twice (middleware + getSessionUser in API)?**
- `middleware.ts` protects **pages** — it redirects the browser to `/login`
- `getSessionUser()` in API routes protects **API endpoints** — it returns a 401 JSON error to fetch() calls from client components

### Role-Based Access Control (RBAC)

`src/lib/rbac.ts` defines a `MODULE_ACCESS` map — which roles can access which feature modules:

```typescript
// Simplified illustration of what's inside rbac.ts:
MODULE_ACCESS = {
  "leads":     ["ADMIN", "OWNER", "MANAGER", "SALES"],
  "invoices":  ["ADMIN", "OWNER", "ACCOUNTS"],
  "cashflow":  ["ADMIN"],
  "users":     ["ADMIN", "IT"],
  ...
}
```

`Shell.tsx` (the sidebar) calls `canAccess(user.role, "leads")` for each nav link. If the function returns false, that link is hidden entirely. A SALES user never sees "Users" or "Cashflow" in their menu.

### Proposal Approval Workflow

This illustrates how business rules are encoded in the API:

```
1. Sales team creates a proposal with a rentPerSeat value
   → POST /api/proposals

2. System checks:
   IF rentPerSeat < ₹8,000 (RATE_THRESHOLD in utils.ts):
     → status = "PENDING_APPROVAL"  (needs manager review first)
   ELSE:
     → status = "DRAFT"  (can be sent directly)

3. Manager approves low-rate proposal
   → POST /api/proposals/[id]/approve
   → status becomes "APPROVED"

4. Sales sends the proposal to the lead (email)
   → POST /api/proposals/[id]/send
   → status becomes "SENT"

5. Lead accepts the proposal
   → POST /api/proposals/[id]/accept
   → status becomes "ACCEPTED"

6. Ops team onboards the lead as a client
   → POST /api/clients  (creates Client record from Proposal)
```

### Vendor Invoice OCR + PO Matching

```
1. User uploads a vendor invoice (PDF or image)
   → POST /api/vendor-invoices  (with filePath)

2. ocrInvoice(filePath) is called  [src/lib/ocr.ts]
   → Returns: { invoiceNo, invoiceDate, amount, gst, poNumber }
   (currently a stub — returns sample data; ready for Textract/Tesseract)

3. System attempts to match against a Purchase Order:
   Case A: user provided a poId manually
     → fetch that PO, compare amounts
     → if difference ≤ 5% → MATCHED, else → MISMATCH

   Case B: OCR found a poNumber in the document
     → look up PO by poNumber in the database
     → compare amounts with same 5% tolerance

   Case C: no PO reference found
     → poMatchStatus = "UNMATCHED"

4. VendorInvoice record is saved with all OCR fields + match status

5. Accounts team reviews and calls POST /api/vendor-invoices/[id]/approve
```

### Monthly Invoice Generation (Cron Endpoint)

```
POST /api/invoices/run-monthly  (called by an external scheduler)

For each ACTIVE client:
  base         = client.occupiedSeats × contract.rentPerSeat
  halfPrice    = partialSeats × (rentPerSeat / 2)
  meetingRooms = sum of chargeable booking hours this month
  subtotal     = base + halfPrice + meetingRooms
  gst          = subtotal × 0.18  (GST_RATE from utils.ts)
  total        = subtotal + gst

→ Creates a ClientInvoice record in the database
→ Sends email to client  (sendMail stub in utils.ts)
→ Returns { generated: N }
```

### How Data Gets From Server to Browser

Next.js server components cannot pass Prisma objects with Date fields directly to client components (they must be serializable). The project uses this pattern:

```typescript
// In page.tsx (server component):
const leads = await prisma.lead.findMany(...)
return <LeadsClient initialLeads={JSON.parse(JSON.stringify(leads))} />
//                  ↑ converts Dates to strings — safe to pass to client
```

---

## 5. Best Practices & Suggestions

### Security

| Issue | Current State | Suggestion |
|---|---|---|
| TypeScript strict mode | `strict: false` in tsconfig | Enable `"strict": true` — catches type errors that become runtime bugs |
| OCR integration | Stub returns fake data | Integrate real OCR (AWS Textract or Google Document AI) before production |
| Input validation | Some routes validate, some don't | Add Zod validation to every API route's request body |
| JWT secret | Default placeholder value | Generate a cryptographically random 64-character string for production |
| `.env` file | May contain real credentials | Confirm `.env` is in `.gitignore` — never commit real secrets |

### Performance

| Issue | Suggestion |
|---|---|
| Dashboard runs 8+ Prisma queries sequentially | Use `Promise.all([...])` to run independent queries in parallel |
| N+1 seat queries in dashboard (one per center) | Use a single `prisma.seat.groupBy()` query instead |
| `JSON.parse(JSON.stringify(data))` on every page | Create a shared `serialize<T>(data: T): T` helper to centralise this |
| No loading states between navigations | Add `loading.tsx` files next to pages for skeleton UIs |

### Code Quality

| Issue | Suggestion |
|---|---|
| `getSessionUser()` repeated in every API route | Create a `withAuth(handler)` higher-order function to reduce boilerplate |
| Large client component files (500+ lines) | Split into sub-components: `XyzTable`, `XyzForm`, `XyzFilters` |
| `sendMail()` is a console.log stub | Wire up nodemailer with real SMTP credentials behind an environment check |
| No shared API response types | Define TypeScript interfaces in `src/types/` shared between API and client code |

### Architecture

| Issue | Suggestion |
|---|---|
| No error boundaries | Add `error.tsx` files next to pages for graceful error display |
| No 404 handling | Add `not-found.tsx` for missing records |
| Cron jobs called via HTTP POST | Consider using Vercel Cron Jobs or a `node-cron` scheduler for reliability |
| No API versioning | Fine for now; add `/api/v1/` prefix before any external clients consume the API |

---

## 6. How Everything Connects

### The Full Customer Lifecycle

```
WEBSITE VISITOR
    │
    ▼  Fills in the public form at /lead-form
    │  POST /api/leads/public  (no login required)
    ▼
DATABASE: Lead record created  (status = NEW)
    │
    ▼  Sales team opens /leads
    │  Updates status: NEW → CONTACTED → TOUR_SCHEDULED
    │  Creates a Visitor record to track the site tour
    ▼
DATABASE: Visitor record  (KYC fields captured)
    │
    ▼  Sales creates a Proposal in /proposals
    │  POST /api/proposals
    │  ┌─ rentPerSeat < ₹8,000? → PENDING_APPROVAL (manager must approve)
    │  └─ rentPerSeat ≥ ₹8,000? → DRAFT (can send directly)
    ▼
DATABASE: Proposal record
    │
    ▼  Manager approves → Sales sends → Lead accepts
    │  /approve → /send → /accept
    ▼
DATABASE: Proposal (status = ACCEPTED)
    │
    ▼  Ops team onboards client in /clients
    │  POST /api/clients       → creates Client record
    │  POST /api/clients/[id]/contract-upload  → uploads signed PDF
    │  Assigns cabin + seats in /centers/[id]/setup
    ▼
DATABASE: Client + Contract + Seats (occupied = true)
    │
    ▼  Every month: POST /api/invoices/run-monthly  (cron job)
    │  Calculates: rent + partial seats + meeting rooms + 18% GST
    │  Creates ClientInvoice, sends email
    ▼
DATABASE: ClientInvoice  (status = UNPAID → PAID)
    │
    ▼  Client logs into /client-portal
    │  Views invoices, raises support tickets
    ▼
DATABASE: Ticket  (status = OPEN → IN_PROGRESS → RESOLVED)
```

### The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                          │
│  src/app/(app)/*/page.tsx  +  *Client.tsx                   │
│  Server components fetch from DB → Client components render  │
│  Styled with Tailwind CSS utility classes                    │
└─────────────────────┬───────────────────────────────────────┘
                      │  fetch() calls from Client components
┌─────────────────────▼───────────────────────────────────────┐
│  API LAYER                                                   │
│  src/app/api/*/route.ts                                      │
│  Validates auth via getSessionUser()                         │
│  Runs business logic (thresholds, workflows, cron jobs)      │
│  Reads/writes via Prisma, returns JSON                       │
└─────────────────────┬───────────────────────────────────────┘
                      │  Prisma ORM
┌─────────────────────▼───────────────────────────────────────┐
│  DATA LAYER                                                  │
│  prisma/schema.prisma  +  MySQL database                     │
│  28 models covering every business domain                    │
│  Foreign key relationships, JSON fields for flexible data    │
└─────────────────────────────────────────────────────────────┘
```

### Middleware & Auth Guard

```
Every browser request
        │
        ▼
src/middleware.ts  ──── Public path? (login, lead-form, qr/*, uploads)
        │                      │
        │ No                   │ Yes
        ▼                      ▼
Read "erp_session"         Allow through
cookie from headers
        │
   Valid JWT?
   │         │
  Yes        No
   │         │
   ▼         ▼
Allow    Redirect to
through   /login
```

### Key Files Quick Reference

| File | Why it matters |
|---|---|
| `src/middleware.ts` | The gatekeeper — runs on every single request |
| `src/lib/auth.ts` | All login, JWT, and session logic lives here |
| `src/lib/rbac.ts` | Defines which roles can access which modules |
| `src/components/Shell.tsx` | The sidebar — navigation for every protected page |
| `prisma/schema.prisma` | The database — every table, column, and relationship |
| `src/lib/utils.ts` | Shared constants (RATE_THRESHOLD, GST_RATE) and formatters |
| `src/lib/db.ts` | The Prisma client singleton — how you talk to the database |
| `src/lib/ocr.ts` | OCR stub — replace with real service before production |

### Database Model Relationships (simplified)

```
Center
  ├── Cabin[]
  │     └── Seat[]
  ├── Lead[]
  │     └── Proposal[]
  │           └── Client
  │                 ├── Contract
  │                 ├── ClientInvoice[]
  │                 ├── Ticket[]
  │                 └── Employee[]
  ├── Vendor[]
  │     ├── PurchaseOrder[]
  │     │     └── VendorInvoice[]
  │     └── Repair[]
  ├── InventoryItem[]
  ├── Asset[]
  ├── MeetingRoom[]
  │     └── Booking[]
  └── User[]
        ├── StaffAttendance[]
        └── LeaveRequest[]
```

---

*Generated for Coworking ERP v0.6.0 — Next.js 14 / Prisma / MySQL*
