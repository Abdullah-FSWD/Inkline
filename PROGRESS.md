# PROGRESS

Interactive Reading & Annotation Platform — build log. Source of truth for where the build stands. Read this first at the start of every session.

Reference docs: BRD v0.2, FRD v0.2, User-Stories v0.2 (Google Docs, linked in project kickoff).

Tech stack: Next.js/TS/Tailwind (frontend), Express/TS (backend), MongoDB via Mongoose, Puppeteer for HTML→PDF. (Originally "MongoDB via Prisma" per kickoff — changed 2026-08-18, see Decisions log.)

Workspace layout: two workspaces, `frontend/` + `backend/`, no monorepo tooling. Decided 2026-08-17 — simple enough at Phase 1 scale, avoid build-orchestration overhead until there's a reason for it.

Work one sub-task at a time, in Suggested Build Sequence order (not document order). Stop after each sub-task for confirmation.

## Stage 0 — Project setup
- [x] Read BRD/FRD/User-Stories v0.2 in full
- [x] Propose workspace layout (two workspaces: frontend/, backend/)
- [x] Create PROGRESS.md
- [x] Scaffold frontend/ (Next.js 16, TS, Tailwind, ESLint, Vitest+RTL) — build/lint/test all green
- [x] Scaffold backend/ (Express 5, TS, ESLint flat config, Vitest+supertest, tsx for dev) — build/lint/test all green
- [x] Initial Prisma schema (empty, MongoDB datasource only) + MongoDB connection confirmed — via MongoDB Atlas (Docker unavailable in this environment; switched per user choice), `prisma db push` and `prisma generate` succeeded against Atlas cluster0. **Superseded 2026-08-18: Prisma removed, switched to Mongoose — see Decisions log.**
- [x] .env / .env.example for backend, gitignored (MONGODB_URI, PORT, JWT_SECRET placeholder). Frontend has no server secrets yet — its existing .env* gitignore rule covers future needs.

## Stage 1 — Accounts & Authentication (Epic 0)
- [ ] US-0.1 — Sign up (User model, POST /auth/signup, sign-up form, dup-email/validation errors)
  - [x] Sub-task 1: Design the User model (email, passwordHash, createdAt) — as a Mongoose schema (`backend/src/models/User.ts`), not Prisma (see Decisions log)
  - [x] Sub-task 2: POST /auth/signup endpoint — validates email format + min 8-char password, hashes with bcryptjs, creates the user, rejects duplicate email (fast-path findOne + unique-index race fallback). Does not yet issue a session (deferred to US-0.2, which decides the session mechanism); acceptance criterion "logs the user in immediately" will be satisfied once that's wired in.
  - [x] Sub-task 3: Next.js sign-up page/form (`frontend/src/app/signup/`) wired to the endpoint via `frontend/src/lib/api.ts`. Client-side validation mirrors backend rules for instant feedback; backend response is authoritative. On success shows a confirmation message (no redirect yet — no session exists until US-0.2/US-0.3 land, so there's nowhere to send the user).
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
- 2026-08-17: Backend uses Prisma 7's new config style (prisma.config.ts + "prisma-client" generator outputting to src/generated/prisma, gitignored) and ESM ("type": "module") throughout. **Superseded — see 2026-08-18 entry below.**
- 2026-08-18: Switched backend data access from Prisma to **Mongoose**, deviating from the kickoff's fixed "MongoDB via Prisma" stack. Reason: the installed Prisma major (7.x) has no MongoDB connector at all — MongoDB projects must stay on Prisma 6.x (stable but not Prisma's forward path) or move to "Prisma Next" (MongoDB support is Early Access/pre-1.0). Presented all options (Prisma 6.x, Prisma Next, Mongoose, raw driver) to the user; user chose Mongoose as the MongoDB-native ODM. Prisma packages, prisma.config.ts, and prisma/ dir removed from backend. `.env` var renamed DATABASE_URL → MONGODB_URI.
- 2026-08-18: Discovered this dev sandbox's Node processes can't do raw UDP DNS SRV/TXT lookups (`querySrv ECONNREFUSED`), which `mongodb+srv://` needs, even though the OS resolver and other tools (nslookup, Prisma's Rust engine) work fine. Fixed by having `backend/src/db.ts` call `dns.setServers(...)` when an optional `DNS_SERVERS` env var is set (set to `8.8.8.8,1.1.1.1` in this environment's `.env`); left unset by default in `.env.example` since real deployments likely won't hit this. Connection verified working end-to-end (create/delete a test doc via Mongoose against Atlas).
- 2026-08-18: Backend tests connect to the real Atlas dev database (no in-memory/mocked Mongo) via `backend/src/test-setup.ts`, cleaning up their own created docs (by tracked email / afterEach). Chose this over `mongodb-memory-server` to avoid an extra binary-download dependency; revisit if test-suite runtime or Atlas usage becomes a problem. Vitest config needs `fileParallelism: false` (single worker) so tests sharing the one Mongoose connection don't race.
- 2026-08-18: Used bcryptjs (pure JS) instead of bcrypt (native) for password hashing — avoids native module build issues on Windows/Node 24, same hashing algorithm and API.
- 2026-08-18: Frontend talks to the backend via `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`), set in `frontend/.env.local` (gitignored) with `.env.example` documenting it. Plain client-side `fetch` from a "use client" component — no Next.js server actions/API routes involved, since all persistence/business logic lives in the Express backend per the fixed architecture.
- 2026-08-18: Design pass per user request — fixed a real contrast bug (form used light-only Tailwind classes with no explicit background, so it went near-invisible under `prefers-color-scheme: dark`). Established a proper light/dark theme via CSS custom properties in `globals.css` (warm "paper" palette — background/foreground/card/accent/danger tokens, both themes defined). Added `framer-motion` (entrance/stagger animations, animated error states) and `lucide-react` (icons) as the frontend's animation/icon libraries going forward. Replaced the default Next.js boilerplate home page with a real Inkline landing page. Verified visually via a one-off Playwright screenshot script (installed, used, then removed — not a project dependency) in both light and dark `prefers-color-scheme`.
