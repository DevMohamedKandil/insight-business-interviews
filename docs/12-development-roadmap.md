# InsightAI — Development Roadmap

**Document 12 of 20**
**Depends on:** All prior documents (this is where they're sequenced into phases)
**Status:** Draft for approval

---

## 1. Roadmap Philosophy

Each phase below ends with a working, demoable increment — never a phase that's "half a feature." This is the same principle that shaped every architectural decision so far (build only what's justified now, log the rest as an explicit future trigger) applied to sequencing rather than to any single component.

## 2. Phase 0 — Foundation (Infrastructure, No Product Features Yet)

**Goal:** An empty but real, secured, deployed skeleton — proves the platform choices before any product logic is built on top of them.

- Firebase project provisioned on Blaze (Vision §13.1), Hosting + Firestore + Functions + Storage + App Check enabled.
- Repository scaffolded per Document 7; `libs/shared-types` package building and importable from both apps.
- Firestore Security Rules (Document 6 §2) deployed — even though no collections have real data yet, the rules are written and tested against the schema from Document 5 from day one, not bolted on later.
- Admin auth (Document 6 §6): the one-time privileged Cloud Function to grant the `admin` claim exists and has been run once for the founder's own account.
- CI pipeline exists (Document 19) — even a minimal one — so every subsequent phase's work is protected from day one, not "added before launch."

**Exit criterion:** an authenticated admin can log into an empty Admin Panel shell; Firestore rules reject an unauthenticated write attempt (verified with the emulator, Document 18).

## 3. Phase 1 — Single-Provider Interview Engine (Walking Skeleton)

**Goal:** One template, one AI provider (OpenAI, as the most mature structured-output support at time of writing — see Document 16 for cost comparison informing this default), end-to-end: create a template, get a link, have a real bounded conversation, see it in Firestore.

- `IAIProvider` interface + `OpenAIProvider` implementation only (Claude/Gemini deliberately deferred to Phase 2 — proving the abstraction with one real implementation before adding more, per the general principle of not building for hypothetical needs prematurely, even though the *interface* is designed multi-provider from the start, Architecture §4).
- `startSession` + `sendMessage` (streaming) Cloud Functions, spend-cap + App Check enforced from the first respondent-facing deploy (Document 6 — these are not "hardening later" items).
- Bounded state machine with coverage goals (Document 10 §3), single structured-output call per turn.
- Minimal template editor (create/edit/publish) — enough to configure the one template needed for internal testing, not the full polished editor UI yet.
- Public interview UI (Document 8 §2-4) fully built — this is the surface real respondents touch, so it gets full UX investment (typing indicator, streaming, pacing) in this phase, not a placeholder.

**Exit criterion:** the founder can share a real link, a real person can complete a real interview on their phone, and a `synthesisReports` document is generated (Phase 1 includes basic synthesis — an empty synthesis pipeline would make this phase's respondent data un-actionable).

## 4. Phase 2 — Multi-Provider + Full Admin Panel

**Goal:** Prove the provider-swap promise (PRD FR-30) for real, and give the operator the actual dashboard, not just Firestore console access.

- `ClaudeProvider`, `GeminiProvider` implementations; a template switched between all three with zero frontend changes, demonstrated explicitly as an acceptance test (Document 18).
- Full Admin Dashboard (Document 8 §6): stat tiles, charts, AI insight summary, CSV/PDF export.
- Session search/filter/detail views (Document 8 §8).
- Template versioning UI (Document 8 §7's version-aware publish flow) fully surfaced, not just functioning server-side.

**Exit criterion:** operator manages multiple live templates across different providers from the Admin Panel alone, with no direct Firestore console usage needed for routine work.

## 5. Phase 3 — Hardening & Real Usage

**Goal:** Take this from "works for the founder testing it" to "safe to share broadly."

- Abuse detection tuning (Document 6 §5) against real adversarial input encountered during Phase 1-2 testing, not just the initial heuristic set.
- Cost/rollup accuracy validation at real (if modest) volume — confirms Document 4's aggregation strategy holds up outside synthetic test data.
- Technical Risk register (Document 15) items with "before broad sharing" urgency addressed.
- Production Checklist (Document 20) fully passed.

**Exit criterion:** a template link can be shared in a public-ish context (e.g., a WhatsApp group of a few hundred people) without the founder needing to babysit it.

## 6. Phase 4+ — Explicitly Deferred Future Features (Tracked, Not Forgotten)

These map directly to the brief's "Future Features" list and PRD §6's out-of-scope items. Each has an explicit **trigger condition** — the signal that says "now it's time to build this" — rather than being an open-ended someday list:

| Future Feature | Trigger Condition |
|---|---|
| Multi-tenant SaaS (Assumption A1's flip side) | A second real user/organization wants to run their own templates — at that point, Document 4/5's schema needs an `orgId` migration and Document 6's admin auth needs per-tenant scoping. Planned as a scoped migration, not a rewrite, *because* the current schema was designed with this seam in mind (every collection already keyed by `templateId`, which becomes tenant-scoped rather than restructured). |
| Voice interviews (STT/TTS) | Text-based interview completion rates and insight quality are validated first — voice adds real cost (STT/TTS API calls) and complexity that should be justified by proven demand for the text version, not assumed. |
| WhatsApp / Telegram / Messenger / SMS / Email channels | The core engine (Architecture §5) is already channel-agnostic (it operates on `InterviewTurnInput`/`Output`, not on "chat UI" specifics) — adding a channel means a new adapter translating that channel's message format to/from the existing engine, not re-architecting the engine. Trigger: demand for reaching respondents who don't click web links. |
| Multi-language UI polish (Arabic/French/Spanish beyond content config) | Trigger: a template's target audience is predominantly non-English-UI-comfortable and content-language-only (already supported, Document 5 §1 `language` field) proves insufficient. |
| AI Voice / real-time speech | Depends on Voice interviews above being validated first. |

---

**Approval needed:** Confirm this phasing before Document 13 (Sprint Plan) breaks Phases 0-3 into concrete sprints.
