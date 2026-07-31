# InsightAI — Sprint Plan

**Document 13 of 20**
**Depends on:** [12-development-roadmap.md](./12-development-roadmap.md)
**Status:** Draft for approval

---

## 1. Cadence Assumption

**Assumption (logged to register as A11):** development capacity is roughly one focused engineer (the founder, possibly assisted by AI-paired implementation) working part-time-to-full-time on this. Sprints are sized in **1-week increments** rather than the conventional 2-week sprint — deliberately short, because at solo-founder velocity, a 2-week sprint risks discovering a wrong architectural assumption a full week later than a 1-week sprint would. This is a process choice tuned to actual team size, not a default copied from larger-team convention.

## 2. Sprint Breakdown — Phase 0 (Foundation)

| Sprint | Deliverable | Verifies |
|---|---|---|
| S0.1 | Firebase project on Blaze; repo scaffolded per Document 7; `libs/shared-types` builds and is importable from both apps | Document 7 |
| S0.2 | Firestore Security Rules deployed + tested against Firestore Emulator with unit tests for every rule in Document 6 §2.1's table (allow/deny both directions) | Document 6 |
| S0.3 | Admin auth: privileged claim-granting function written and run once; `admin` route guard + login screen | Document 6 §6, Document 8 §5 |
| S0.4 | Minimal CI pipeline (lint + unit tests + emulator-based rules tests on every push) | Document 19 (forward reference — CI exists before it's fully documented, which is fine; the pipeline itself is simple enough to precede its own write-up) |

## 3. Sprint Breakdown — Phase 1 (Single-Provider Walking Skeleton)

| Sprint | Deliverable | Verifies |
|---|---|---|
| S1.1 | `IAIProvider` interface + `OpenAIProvider`; `AIProviderFactory` with one registered provider; unit tests using a mocked provider (no real API calls in CI, Document 18) | Document 3 §4, Document 10 §6 |
| S1.2 | `startSession` + `TemplateRepository`/`SessionRepository`; template creation via direct Firestore console/script for this sprint (editor UI comes in S1.4) | Document 9 §2.1, Document 5 §1-2 |
| S1.3 | `sendMessage` streaming function: spend-guard check, abuse heuristic, bounded history, structured-output call, classification persistence, coverage-goal termination logic | Document 10 §2-3 |
| S1.4 | Public interview UI: entry/active/closing/unavailable states, typing indicator + pacing, streamed rendering | Document 8 §2-4, Document 11 §3 |
| S1.5 | Minimal template editor (create/edit/publish, one provider only) | Document 8 §7 (partial), Document 9 §3.1-3.3 |
| S1.6 | Basic synthesis pipeline (`onSessionComplete` → `onSynthesisRequested`), even if the generated report's prose quality is still being tuned | Document 5 §3, Document 10 §4-5 |
| S1.7 | **End-to-end dry run:** founder personally completes a real interview on a phone, confirms a synthesis report and rollup update appear | Phase 1 exit criterion (Document 12 §3) |

## 4. Sprint Breakdown — Phase 2 (Multi-Provider + Admin Panel)

| Sprint | Deliverable | Verifies |
|---|---|---|
| S2.1 | `ClaudeProvider`, `GeminiProvider`; acceptance test: same template, three provider values, three successful interviews | Document 3 §4, Document 12 §4's "prove the swap" goal |
| S2.2 | Dashboard stat tiles + charts, reading `analyticsRollups` | Document 8 §6, Document 4 §4 |
| S2.3 | Session list/search/filter + session detail (transcript/classification/synthesis tabs) | Document 8 §8 |
| S2.4 | CSV/PDF export (`exportSessions`) | Document 9 §3.4 |
| S2.5 | Template versioning UI polish (version history view, "publishing creates version N" messaging) | Document 8 §7 |

## 5. Sprint Breakdown — Phase 3 (Hardening)

| Sprint | Deliverable | Verifies |
|---|---|---|
| S3.1 | Adversarial testing pass: attempt real prompt injections, rapid-fire session-start scripting against App Check/rate limits, review `abuseFlag`/rejection metrics | Document 6 §3, §5 |
| S3.2 | Cost/rollup accuracy validation against Document 16's projections using real Phase 1-2 usage data | Document 4, Document 16 |
| S3.3 | Work through Document 15's risk register items flagged "before broad sharing" | Document 15 |
| S3.4 | Full Document 20 Production Checklist pass | Document 20 |

## 6. What Is Deliberately Not Sprint-Planned Yet

Phase 4+ (Document 12 §6) items have no sprints assigned — planning sprints for work gated behind an undetermined future trigger condition would produce dates with no real meaning, which is a worse artifact than no plan at all.

---

**Approval needed:** Confirm this sequencing before Document 14 (MVP Scope) draws the precise v1 cut line implied by Phase 1's exit criterion.
