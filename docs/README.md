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
