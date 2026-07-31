# InsightAI — Folder Structure

**Document 7 of 20**
**Depends on:** [03-software-architecture.md](./03-software-architecture.md), [06-security-model.md](./06-security-model.md)
**Status:** Draft for approval

---

## 1. Repository & Tooling Decision

**Decision:** A single monorepo containing both the Angular frontend and the Cloud Functions backend, using **npm workspaces** (not Nx, not Lerna, not separate repositories).

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Separate repos (frontend / functions) | Clean deploy boundaries, familiar to teams that scale into separate ownership | Shared TypeScript types (e.g., `InterviewTurnOutput`, Firestore document interfaces) must be duplicated or published as a private package — real friction for a two-surface product built by one engineer/team | Rejected — the coordination cost is paid immediately, the benefit (independent ownership) isn't needed until there's a second team |
| Nx monorepo | Powerful caching, dependency graphs, generators, well-suited to large multi-app workspaces | Meaningful learning-curve and tooling overhead for a workspace that currently has exactly two deployable units (one Angular app, one Functions app) | Rejected for v1 — logged as the natural upgrade path if the codebase grows a third deployable surface (e.g., a separate marketing site, or splitting Functions into multiple services) |
| npm workspaces, single monorepo, no extra tooling | Native to npm (no new dependency), trivially shares a `libs/shared-types` package between frontend and backend via TypeScript project references, simplest possible setup that still solves the real problem (shared types) | Less automation (no built-in affected-graph test running) than Nx | **Chosen** — solves the one real cross-cutting problem (shared types) with the least new tooling, consistent with Architecture §8's general bias against unnecessary infrastructure at this scale |

## 2. Top-Level Layout

```
InsightAI/
├── docs/                          # This planning series (Documents 1-20)
├── apps/
│   ├── web/                       # Angular 20 application (public interview + admin panel)
│   └── functions/                 # Cloud Functions backend
├── libs/
│   └── shared-types/               # TypeScript interfaces shared by web + functions (see §1)
├── firestore.rules                 # Security rules (Document 6 §2)
├── firestore.indexes.json          # Composite indexes (Document 5 §10)
├── storage.rules                   # Firebase Storage rules
├── firebase.json                   # Firebase project config (hosting, functions, emulators)
├── .firebaserc
├── package.json                    # Workspace root
└── README.md
```

**Rationale for `libs/shared-types` as a real package, not a copy-pasted `.d.ts`:** every Firestore document shape defined in Document 5, and every `IAIProvider` interface shape from Architecture §4, is consumed by *both* the Angular app (for typed `onSnapshot` reads) and the Cloud Functions backend (for typed writes). A single source of truth prevents the classic monorepo failure mode where frontend and backend silently drift on what a `Session` document looks like.

## 3. `apps/functions/` — Maps Directly to Architecture §2's Layers

```
apps/functions/
├── src/
│   ├── api/                        # API Layer — Callable & HTTPS functions ONLY
│   │   ├── startSession.ts
│   │   ├── sendMessage.ts          # HTTPS, streamed response (Architecture §6)
│   │   ├── admin/
│   │   │   ├── createTemplate.ts
│   │   │   ├── publishTemplate.ts
│   │   │   └── exportSessions.ts
│   │   └── triggers/                # Firestore-triggered functions (not client-callable)
│   │       ├── onMessageWrite.ts     # Rollup increment (Document 4 §4)
│   │       ├── onSessionComplete.ts  # Synthesis kickoff + rollup increment
│   │       └── onSynthesisRequested.ts
│   │
│   ├── services/                    # Service Layer — business rules, zero Firestore/vendor SDK calls directly
│   │   ├── interview.service.ts
│   │   ├── template.service.ts
│   │   ├── analytics.service.ts
│   │   ├── synthesis.service.ts
│   │   ├── spend-guard.service.ts   # Document 6 §4
│   │   └── abuse-detection.service.ts # Document 6 §5
│   │
│   ├── providers/                   # AI Provider Layer (Architecture §4)
│   │   ├── ai-provider.interface.ts
│   │   ├── openai.provider.ts
│   │   ├── claude.provider.ts
│   │   ├── gemini.provider.ts
│   │   └── ai-provider.factory.ts
│   │
│   ├── repositories/                 # Repository Layer — one file per collection (Document 5)
│   │   ├── template.repository.ts
│   │   ├── session.repository.ts
│   │   ├── message.repository.ts
│   │   ├── synthesis-report.repository.ts
│   │   ├── quote.repository.ts
│   │   ├── opportunity.repository.ts
│   │   ├── analytics-rollup.repository.ts
│   │   ├── audit-log.repository.ts
│   │   └── configuration.repository.ts
│   │
│   ├── security/
│   │   ├── app-check.middleware.ts
│   │   ├── auth-guard.ts             # Admin custom-claim check (Document 6 §6)
│   │   └── pii-masking.ts            # Document 6 §7
│   │
│   ├── composition-root.ts           # Manual DI wiring (Architecture §3)
│   └── index.ts                      # Function exports registry
│
├── test/                             # Mirrors src/ structure (Document 18 — Testing Strategy)
├── package.json
└── tsconfig.json
```

**Why `api/` contains no logic beyond validation and delegation:** this is a direct enforcement of Architecture §2's layer table ("API Layer... Must NOT contain business logic"). A new engineer reading `sendMessage.ts` should see roughly ten lines: validate input shape, check App Check, call `interviewService.processTurn(...)`, stream the result. Every rule about spend caps, coverage goals, or classification lives in `services/`, where it can be unit-tested without spinning up a Functions emulator (Document 18).

## 4. `apps/web/` — Angular 20, Standalone Components, Signals

```
apps/web/
├── src/
│   ├── app/
│   │   ├── core/                     # Singleton services, guards, interceptors — provided once at root
│   │   │   ├── auth/
│   │   │   │   ├── anonymous-auth.service.ts
│   │   │   │   └── admin-auth.guard.ts
│   │   │   ├── firebase/
│   │   │   │   └── firestore-collections.ts  # Typed collection refs, built on libs/shared-types
│   │   │   └── config/
│   │   │       └── feature-flags.service.ts
│   │   │
│   │   ├── interview/                 # Public interview surface (PRD §3.2)
│   │   │   ├── interview-shell/       # Route component: resolves slug → template, starts session
│   │   │   ├── chat/                  # Message list, typing indicator, streaming renderer
│   │   │   ├── progress-indicator/
│   │   │   └── interview.service.ts   # Thin client-side service: calls `sendMessage`, subscribes to session
│   │   │
│   │   ├── admin/                     # Admin Panel (PRD §3.6) — lazy-loaded, behind admin-auth.guard
│   │   │   ├── dashboard/
│   │   │   ├── templates/
│   │   │   │   ├── template-list/
│   │   │   │   ├── template-editor/
│   │   │   │   └── template-versions/
│   │   │   ├── sessions/
│   │   │   │   ├── session-list/
│   │   │   │   └── session-detail/
│   │   │   ├── analytics/
│   │   │   └── login/
│   │   │
│   │   ├── shared/                     # Presentational components, pipes, Angular Material wrappers
│   │   └── app.routes.ts
│   │
│   ├── environments/
│   └── styles/
├── angular.json
└── package.json
```

**Rationale for the `interview/` vs `admin/` split at the top level, not just routing:** these two surfaces have almost no shared UI (a chat bubble list vs. a data dashboard) and, critically, different auth models (anonymous vs. real admin auth — Document 6 §6). Keeping them as structurally separate feature areas makes it visually obvious in the file tree which code is public-untrusted-input-facing and which is operator-only — a security-relevant distinction, not just a UX one.

## 5. `libs/shared-types/`

```
libs/shared-types/
├── src/
│   ├── firestore/                    # One file per collection schema (Document 5), the actual TS interfaces
│   │   ├── template.types.ts
│   │   ├── session.types.ts
│   │   ├── message.types.ts
│   │   ├── synthesis-report.types.ts
│   │   └── ...
│   ├── ai-provider/
│   │   └── ai-provider.types.ts       # InterviewTurnInput/Output (Architecture §4)
│   └── index.ts
└── package.json
```

## 6. Naming & File Conventions

- One class/service per file, file name matches export in kebab-case (`spend-guard.service.ts` exports `SpendGuardService`) — standard Angular convention, extended to the Functions codebase for consistency across the monorepo rather than adopting two different naming styles.
- Every Repository file name matches its Firestore collection name singularized (`session.repository.ts` ↔ `sessions` collection) — makes the mapping in Document 5 traceable without a lookup table.
- Test files sit in a mirrored `test/` tree rather than co-located `*.spec.ts` next to source, for the Functions app (backend convention favoring a clean `src/` deploy bundle); Angular retains its conventional co-located `*.spec.ts` (framework convention, not worth fighting).

---

**Approval needed:** Confirm this structure before Document 8 (UI Wireframes), which will reference specific component names from `apps/web/src/app/`.
