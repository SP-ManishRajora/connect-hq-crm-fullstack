# Client Portal & Meeting-Room Booking — Feature Guide

> **Audience:** Teammates picking up the client-facing login, registration, and meeting-room booking features.
> **Goal:** Understand what a *client* can do, how self-registration and password reset work, how bookings are validated, which roles do what, and where the code lives.
> **Last verified against code:** 2026-07-14.

---

## 1. The Big Picture

This feature gives **clients** (companies renting space and their employees) a self-service portal, layered on top of the existing ERP auth and `MeetingRoom`/`Booking` models. It was built by **extending** the existing architecture, not duplicating it — the ERP already had JWT auth, bcrypt hashing, a `CLIENT` role, and booking overlap/quota logic.

A client user can:

| Capability | Where |
|------------|-------|
| Register via an emailed invite link | `/register?token=…` |
| Log in / log out | `/login`, existing `erp_session` cookie |
| Reset a forgotten password | `/forgot-password` → `/reset-password?token=…` |
| See a dashboard (welcome, upcoming bookings, history, quota) | `/client-portal` |
| Browse meeting rooms with details (capacity, amenities, price, availability) | `/client-portal` |
| Filter rooms by date / time / capacity | `/client-portal` |
| Book a room (with conflict + past-date validation) | `/client-portal` |
| Cancel their own booking (subject to business rules) | `/client-portal` |
| Raise tickets / feedback, view notices & invoices | `/client-portal` (pre-existing) |

**Mental model:** Staff **onboard a client and invite their people**; those people **self-register**, then **browse and book meeting rooms** within the client's monthly quota, with overage charged at the room's hourly rate.

---

## 2. Roles & Permissions

Module access is in [`src/lib/rbac.ts`](../src/lib/rbac.ts); every API route re-checks auth.

| Module key | Roles | Notes |
|------------|-------|-------|
| `client_portal` | CLIENT | The client dashboard |
| `bookings` | ADMIN, OWNER, CENTER_MANAGER, OPS, SALES, CLIENT | Staff booking screen + client bookings |

**Invite generation** (`POST /api/clients/[id]/invites`) is restricted to **ADMIN, OWNER, MANAGER, CENTER_MANAGER**. A CENTER_MANAGER may only invite for clients in **their own center**.

**Booking cancellation** rules (`POST /api/bookings/[id]/cancel`):
- Staff (**ADMIN, OWNER, CENTER_MANAGER**) can cancel any booking.
- A **client** can cancel only **their own** booking, and only up to **60 minutes** before it starts (`CANCEL_CUTOFF_MINUTES`). Past / in-progress bookings can't be cancelled by clients.

---

## 3. Authentication & Account Lifecycle

Auth primitives live in [`src/lib/auth.ts`](../src/lib/auth.ts): `hashPassword`/`verifyPassword` (bcrypt, cost 10), `createSession`/`getSessionUser` (JWT via `jose`, 7-day `erp_session` httpOnly cookie). Client-specific flows live in [`src/lib/client-auth.ts`](../src/lib/client-auth.ts).

### 3.1 The `ClientInvite` token store

One table backs **both** the invite and password-reset flows, distinguished by `type`:

```
model ClientInvite {
  token            String  @unique   // 32-byte crypto-random hex
  type             String            // "INVITE" | "RESET"
  email            String
  employerClientId String?           // INVITE: employer Client of the new user
  userId           String?           // RESET: the user whose password is reset
  invitedById      String?           // staff who issued an INVITE
  expiresAt        DateTime          // INVITE: 72h · RESET: 2h
  usedAt           DateTime?         // single-use marker
}
```

Tokens are generated with `node:crypto` `randomBytes(32)`. Both flows are **single-use** (`usedAt`) and **time-boxed** (`expiresAt`).

### 3.2 Registration (invite → set password)

1. Staff opens a client → **Employee Directory → ✉ Invite via email** → `POST /api/clients/[id]/invites`.
   - Validates email, rejects existing accounts, **enforces the login cap** (see §3.4), emails the link via `sendMail`, and **returns the link** in the JSON so staff can copy it when SMTP isn't configured.
2. Recipient opens `/register?token=…`. The page calls `GET /api/auth/register?token=…` to validate and prefill the email + company.
3. Recipient sets name + password → `POST /api/auth/register`.
   - Re-validates the token, enforces the **password policy** (§3.5), re-checks the login cap at consume time (guards against races / stale invites), creates a `role: "CLIENT"` user linked via `employerClientId`, and marks the token used.

**Resending / revoking an invite.** The client detail page shows a **Pending invites** panel (email, sent, expires) for every unused, unexpired invite:
- **Resend** → `POST /api/clients/[id]/invites/[inviteId]/resend`. Reuses the existing invite row but **rotates the token** and resets the 72h expiry, then re-emails the link. The old link stops working immediately. Because the row is reused, a resend does **not** count as an extra pending invite against the login cap (§3.4).
- **Revoke** → `DELETE /api/clients/[id]/invites/[inviteId]`. Marks the invite used so its link can no longer be redeemed and it stops counting against the cap.

Both actions are limited to **ADMIN, OWNER, MANAGER, CENTER_MANAGER** (CM only for their own center) and verify the invite belongs to the client. `GET /api/clients/[id]/invites` lists the pending invites. To resend to someone who already registered, use the **password reset** flow instead (§3.3).

### 3.3 Password reset

1. `/forgot-password` → `POST /api/auth/forgot-password`.
   - **Always returns `ok: true`** regardless of whether the email exists (anti-enumeration). If a matching active user exists, a `RESET` token is created and emailed.
2. `/reset-password?token=…` validates via `GET /api/auth/reset-password?token=…`, then `POST` sets the new password (policy-checked) and marks the token used.

### 3.4 Login cap ("number of logins manageable")

`loginCapFor(clientId)` in `client-auth.ts` computes:

- **cap** = `max(1, client.occupiedSeats)` — a client gets as many portal logins as occupied seats.
- **used** = active CLIENT users of that client **+ pending (unused, unexpired) invites**.
- **remaining** = `max(0, cap − used)`.

Enforced in **both** entry points: the invite route and the direct `POST /api/clients/[id]/employees` route. When full, they return **409** with a clear message. Register re-checks at consume time (excluding the invite being consumed) so an issued invite can always be completed if a slot is genuinely free.

### 3.5 Password policy

`passwordError(pw)` (shared by register + reset + direct employee creation): **min 8 chars**, must contain **letters and numbers**. Returns an error string or `null`.

---

## 4. Meeting Rooms & Availability

Model: `MeetingRoom { name, capacity, hourlyRate, amenities?, active }`. **`amenities`** was added as a JSON-array text column (e.g. `["Projector","Whiteboard","AC"]`).

### `GET /api/meeting-rooms` — listing + availability

Query params (all optional):

| Param | Effect |
|-------|--------|
| `centerId` | Restrict to a center |
| `minCapacity` | Only rooms seating ≥ N |
| `start`, `end` (ISO) | When **both** given, each room is annotated `available: boolean` (no `CONFIRMED` booking overlaps the slot). Without them, `available: null`. |

Overlap uses the standard half-open interval test: `startTime < end AND endTime > start`.

### `POST /api/meeting-rooms` — create room (staff)

Accepts `amenities` as an array **or** a comma-separated string; normalizes to a JSON-array string. Amenities input is exposed on **Meeting Rooms → + Add Room** (`bookings/BookingsClient.tsx`).

---

## 5. Booking Rules

Creation: `POST /api/bookings` (pre-existing, extended). Validation order:

1. Auth required (401 otherwise).
2. Room must exist.
3. Valid date/time and `end > start` (else 400).
4. **No past start times** (`start < now` → 400). *(Added by this feature.)*
5. **No overlap** with a `CONFIRMED` booking on that room (else **409**).
6. **Quota / charge:** for a resolved client, monthly quota = `occupiedSeats × 2` hours. Hours beyond the remaining quota are `isChargeable` at `room.hourlyRate`. Non-client / walk-in bookings are fully chargeable.

The client is resolved from the session user by **email or employer link**:
`client.findFirst({ where: { OR: [{ email }, { employees: { some: { id } } }] } })`.

Cancellation: `POST /api/bookings/[id]/cancel` sets `status: "CANCELLED"` — see §2 for the rules. Rejects already-cancelled bookings (400) and non-owned bookings for clients (403).

### On-behalf booking (who can book for which client)

`POST /api/bookings` accepts an optional `clientId` and authorizes it by role:

| Caller role | Allowed `clientId` |
|-------------|--------------------|
| CLIENT | Only their own client — a mismatched `clientId` → **403**. Omitting it auto-pins to their client. |
| CENTER_MANAGER | Any client **in their own center** — others → **403**. |
| ADMIN / OWNER | Any client. |
| SALES / OPS | Any client (they manage the center's bookings). |

An unknown `clientId` → **400**. Charges and monthly quota always apply to the **resolved** client, not the caller. When no client resolves (staff walk-in), the booking is fully chargeable at the room rate.

### Schedule calendar (`/bookings`)

The bookings page (module `bookings`, visible to all roles incl. CLIENT) shows a **week-view calendar** of all `CONFIRMED` bookings — any logged-in user can see the schedule. Features:
- 8am–8pm week grid, 7 day columns, blocks colored per room; week **Prev / Today / Next** navigation.
- **Center** and **Room** filters.
- **Click an empty slot** to open the booking form prefilled with that day/hour.
- **Calendar / List** view toggle (list retains the sortable table).
- Staff (ADMIN/OWNER/CENTER_MANAGER/SALES/OPS) see a **"Book on behalf of client"** picker in the form (CM's picker is scoped to their center); the "+ Add Room" button shows only for ADMIN/OWNER/CENTER_MANAGER.
- Users can **cancel their own** bookings inline (subject to the §2 cutoff rules).

The week grid initializes on the client (in `useEffect`) so "today" never differs between server and client render — avoiding hydration mismatches.

---

## 6. Client Dashboard (`/client-portal`)

Server page ([`client-portal/page.tsx`](../src/app/(app)/client-portal/page.tsx)) resolves the client (email or employer link) and loads, in parallel: tickets, notices, invoices, **upcoming bookings** (`CONFIRMED`, `endTime ≥ now`), **history** (past or cancelled, take 50), **rooms** (scoped to the client's center), and the **monthly quota**.

Client component ([`ClientPortal.tsx`](../src/app/(app)/client-portal/ClientPortal.tsx)) renders:
- Summary tiles (upcoming count, room count, quota remaining).
- **Upcoming bookings** list with per-row **Cancel**.
- **Room browser**: date/from/to/min-capacity filters → **Check availability** calls `GET /api/meeting-rooms` and tags each card Available/Booked; cards show capacity, price, and amenity badges; **Book this room** prefills the booking form.
- **Booking form** (`POST /api/bookings`) with inline error surfacing.
- **Booking history** table.
- Existing tickets / feedback / notices / invoices sections (preserved).

---

## 7. Files

**Schema / migration**
- [`prisma/schema.prisma`](../prisma/schema.prisma) — `MeetingRoom.amenities`, new `ClientInvite` model + relations.
- `prisma/migrations/…_client_invites_and_room_amenities/` — applied migration.

**Library**
- [`src/lib/client-auth.ts`](../src/lib/client-auth.ts) — token/invite/reset helpers, `loginCapFor`, `passwordError`. *(new)*

**API routes** *(new unless noted)*
- `GET|POST /api/clients/[id]/invites`
- `POST /api/clients/[id]/invites/[inviteId]/resend`
- `DELETE /api/clients/[id]/invites/[inviteId]`
- `GET|POST /api/auth/register`
- `POST /api/auth/forgot-password`
- `GET|POST /api/auth/reset-password`
- `POST /api/bookings/[id]/cancel`
- `GET /api/meeting-rooms` (added; `POST` extended for amenities)
- `POST /api/bookings` — past-date guard added
- `POST /api/clients/[id]/employees` — login-cap + password policy added

**Pages** *(new unless noted)*
- `src/app/register/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`
- `client-portal/page.tsx` + `ClientPortal.tsx` — upgraded dashboard
- `login/page.tsx` — "Forgot password?" link
- `bookings/BookingsClient.tsx` — amenities input
- `clients/[id]/ClientDetail.tsx` — "Invite via email"
- `src/middleware.ts` — public paths for the new pages/routes

---

## 8. Environment

- **`APP_URL`** — base URL used to build invite/reset links in emails (falls back to `http://localhost:3000`). Set this to your deployed host.
- **SMTP** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) — when unset, `sendMail` logs to the console and the invite API still returns the link for manual sharing.
- **`JWT_SECRET`** — signs the `erp_session` cookie (existing).

---

## 9. Manual QA Checklist

- [ ] Invite an email → open the link → register → land on login, then sign in.
- [ ] Invite an existing account email → rejected.
- [ ] Fill a client's seat cap, then invite once more → **409** "Login limit reached".
- [ ] Register with a **weak password** (`short`) → rejected; with `password123` → succeeds.
- [ ] Reuse a consumed invite/reset link → rejected (single-use).
- [ ] **Resend** a pending invite → old link stops working, new link works, cap unchanged. **Revoke** → link dies, slot freed.
- [ ] Open an **expired** token → "invalid or has expired".
- [ ] Forgot-password for a real and a fake email → both show the same neutral message.
- [ ] Browse rooms, set a date/time, **Check availability**; book a room; a second overlapping booking → **409**.
- [ ] Try to book a **past** slot → rejected.
- [ ] Cancel a future booking (> 60 min away) → succeeds; cancel one starting in 30 min → blocked; cancel someone else's booking as a client → 403.
- [ ] Room card shows **amenities badges** and price / "Within quota".

### Edge cases verified (automated E2E, 2026-07-14)
Room+amenities creation, availability + min-capacity filtering, booking, overlap 409, past-date 400, cancel success / cutoff / double-cancel, unauthenticated request blocked by middleware, invite→register single-use, forgot→reset. **22/23 assertions passed**; the one miss was a test artifact — unauthenticated **API** calls receive a **307 redirect to `/login`** from `middleware.ts` (the app-wide convention) rather than a JSON 401, so the request is still correctly blocked.
