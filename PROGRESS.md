# PROGRESS

Interactive Reading & Annotation Platform — build log. Source of truth for where the build stands. Read this first at the start of every session.

Reference docs: BRD v0.2, FRD v0.2, User-Stories v0.2 (Google Docs, linked in project kickoff).

Tech stack: Next.js/TS/Tailwind (frontend), Express/TS (backend), MongoDB via Prisma, Puppeteer for HTML→PDF.

Workspace layout: two workspaces, `frontend/` + `backend/`, no monorepo tooling. Decided 2026-08-17 — simple enough at Phase 1 scale, avoid build-orchestration overhead until there's a reason for it.

Work one sub-task at a time, in Suggested Build Sequence order (not document order). Stop after each sub-task for confirmation.

## Stage 0 — Project setup
- [x] Read BRD/FRD/User-Stories v0.2 in full
- [x] Propose workspace layout (two workspaces: frontend/, backend/)
- [x] Create PROGRESS.md
- [x] Scaffold frontend/ (Next.js 16, TS, Tailwind, ESLint, Vitest+RTL) — build/lint/test all green
- [x] Scaffold backend/ (Express 5, TS, ESLint flat config, Vitest+supertest, tsx for dev) — build/lint/test all green
- [x] Initial Prisma schema (empty, MongoDB datasource only) + MongoDB connection confirmed — via MongoDB Atlas (Docker unavailable in this environment; switched per user choice), `prisma db push` and `prisma generate` succeed against Atlas cluster0
- [x] .env / .env.example for backend, gitignored (DATABASE_URL, PORT, JWT_SECRET placeholder). Frontend has no server secrets yet — its existing .env* gitignore rule covers future needs.

## Stage 1 — Accounts & Authentication (Epic 0)
- [ ] US-0.1 — Sign up (User model, POST /auth/signup, sign-up form, dup-email/validation errors)
- [ ] US-0.2 — Log in (POST /auth/login, session mechanism decision, login form, generic error)
- [ ] US-0.3 — Log out (POST /auth/logout, logout action, route protection)
- [ ] US-0.4 — Per-user data isolation (auth middleware, ownership checks, cross-user access tests)
- [ ] US-0.5 — Session persistence (rehydration on load, expiry handling)

## Stage 2 — Upload + library for PDFs only
- [ ] US-1.1 — Upload local file (POST /documents/upload, Document model, file storage, upload UI)
- [ ] US-1.2 — Detect file type (PDF path only for now; HTML branch stubbed/deferred)
- [ ] US-1.5 — Conversion status (trivial for PDFs — status is immediately ready)
- [ ] US-2.1 — List documents
- [ ] US-2.2 — Open a document
- [ ] US-2.3 — Delete a document
- [ ] US-2.4 — Status indication in list

## Stage 3 — Document rendering (Epic 3)
- [ ] US-3.1 — Render pages page by page
- [ ] US-3.2 — Page navigation + position indicator
- [ ] US-3.3 — Zoom / fit
- [ ] US-3.4 — Distraction-free layout

## Stage 4 — Annotation tools, persisted (Epic 4)
- [ ] US-4.1 — Pencil tool
- [ ] US-4.2 — Highlighter tool
- [ ] US-4.3 — Underline/draw tool
- [ ] US-4.4 — Tool color and width
- [ ] US-4.5 — Erase / undo
- [ ] US-4.6 — Annotation independent of content type
- [ ] US-4.7 — Persist strokes via API (Annotation model, endpoints, wiring, retry, load-and-render)

## Stage 5 — Reading position (Epic 5)
- [ ] US-5.1 — Resume position
- [ ] US-5.2 — Visual position marker

## Stage 6 — HTML-to-PDF conversion (Epic 1 remainder)
- [ ] US-1.3 — Convert HTML to fixed pages (Puppeteer, Page model, async job)
- [ ] US-1.4 — Page-break handling

## Stage 7 — Export (Phase 2 candidate, Epic 6)
- [ ] US-6.1 — Export flattened PDF

## Decisions log
- 2026-08-17: Two-workspace layout (frontend/ + backend/), no monorepo tooling.
- 2026-08-17: MongoDB Atlas (free tier) instead of local Docker — Docker is not available in the dev environment. DATABASE_URL points at Atlas cluster0.hn3zwoo.mongodb.net, db name "inkline".
- 2026-08-17: Vitest pool set to "threads" (not default "forks") in both workspaces — forks pool hung/timed out in this sandboxed environment.
- 2026-08-17: Backend uses Prisma 7's new config style (prisma.config.ts + "prisma-client" generator outputting to src/generated/prisma, gitignored) and ESM ("type": "module") throughout.
