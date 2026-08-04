# Documentation Index — Coworking ERP

All project documentation lives here. Start with whichever section fits your need.

## 📖 Project overview & architecture
- **[project-documentation.md](./project-documentation.md)** — complete reference: project scope, architecture, folder/file structure, function logic & data flow, best practices, and how everything connects.
- **[../README.md](../README.md)** — quick-start / top-level summary (stays at repo root by convention).

## 📜 Changes & features
- **[CHANGELOG.md](./CHANGELOG.md)** — per-patch changelog of every functional change shipped.
- **[feature-log.md](./feature-log.md)** — requirement → implementation log for recent feature work (occupancy module, proposals email/PDF, lead status, comment edits, searchable category combobox, etc.).

## 👤 Client portal & booking (in-depth)
- **[client-portal-booking.md](./client-portal-booking.md)** — client login, emailed-invite self-registration, password reset, meeting-room browsing/filtering, booking rules (conflict + past-date + quota), cancellation rules, login cap, files, env, and QA checklist.

## 🪑 Occupancy module (in-depth)
- **[occupancy-module.md](./occupancy-module.md)** — design, decisions, phase plan, schema, RBAC, events, and convergence with Seat Map. The source of truth for the module across sessions.
- **[occupancy-and-seatmap-functionality.md](./occupancy-and-seatmap-functionality.md)** — behavior-focused reference: what Occupancy and Seat Map do and the business rules that govern them.

## 🧹 Housekeeping, inspection & generator monitoring (in-depth)
- **[housekeeping-module.md](./housekeeping-module.md)** — QR-based centre inspections, AI photo analysis, corrective actions, generator monitoring, alerts, and the client cleaning-request module. Decisions, phase-by-phase development checklist, role mapping, and acceptance-criteria trace. The source of truth for the module across sessions.
- **[housekeeping-user-manual.md](./housekeeping-user-manual.md)** — for supervisors, housekeeping staff and security: running rounds, raising issues, generator ON/OFF, and what each flag means.
- **[housekeeping-admin-manual.md](./housekeeping-admin-manual.md)** — for ADMIN/OWNER: setup, RBAC, the two QR code sets, every tunable setting, devices, retention and troubleshooting.
- **[housekeeping-deployment.md](./housekeeping-deployment.md)** — deploying the module to live: the 7 new env vars, private photo storage, seed scripts, 6 cron jobs, backups, and a post-deploy smoke test.
- **[housekeeping-deferred.md](./housekeeping-deferred.md)** — running ledger of items consciously skipped inside completed phases, blocked work, open business decisions, and work deliberately declined with the trigger that would justify revisiting it. 10 of 36 rows cleared.
- **[houskeepingFeacture.md](./houskeepingFeacture.md)** — the raw client requirement brief the module is built from.

## 🚀 Deployment
- **[deployment-guide.md](./deployment-guide.md)** — full production deployment guide (Next.js 14 + Prisma), framed for Laravel devs.
- **[server-deployment.md](./server-deployment.md)** — concise live-server update/deploy flow (git pull → build → restart).

## 🧰 Reference
- **[reference-prompts.md](./reference-prompts.md)** — saved production-grade prompts used to build/enhance features.

---

### Conventions
- Feature requirements + what was built → add to **feature-log.md**.
- Shipped functional changes → add a dated entry to **CHANGELOG.md**.
- Module-deep design (like Occupancy) → its own `*-module.md` here, with a pointer added to this index.
