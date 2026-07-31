# InsightAI — Architecture Decision Records

**Purpose:** A permanent, numbered log of every significant architectural decision, in the standard ADR format (Context → Options → Decision → Rationale → Consequences). Documents 1-20 contain the full narrative reasoning; this log is the compact, chronological, never-deleted index of *what was decided and when* — so architectural context survives across sessions even if a future reader never opens the full 20-document series.

**Rule going forward:** every new significant decision gets a new ADR entry appended here **before** or **during** implementation, not after. Superseded decisions are marked `Superseded by ADR-00XX`, never deleted — the history of *why we changed our mind* is itself valuable.

---

### ADR-0001 — Layered Monolith, Not Microservices
- **Status:** Accepted
- **Context:** Backend needs clear internal modularity without the operational cost of multiple deployed services.
- **Options:** (a) Microservices per domain, (b) layered monolith in one Functions codebase.
- **Decision:** (b). One Cloud Functions codebase, strict internal layers (API → Service → Repository, plus AI Provider layer).
- **Rationale:** No current or near-term traffic pattern creates a problem microservices solve (independent scaling, independent team ownership). Modularity comes from interfaces and folder boundaries, not process boundaries.
- **Consequences:** Single deploy unit for the backend; layer boundaries are enforced by code review discipline, not by network isolation. Revisit only on an organizational signal (multiple teams owning distinct domains), not a traffic signal.
- **Source:** [03-software-architecture.md](../03-software-architecture.md) §1-2, ADR table §8.

### ADR-0002 — AI Provider Abstraction via `IAIProvider` Interface
- **Status:** Accepted
- **Context:** Must never couple business logic to one AI vendor; must support OpenAI, Claude, Gemini, OpenRouter, DeepSeek, Qwen, future local models via configuration only.
- **Options:** (a) Direct vendor SDK calls scattered through services, (b) a single `IAIProvider` interface with one implementation class per provider, resolved by a factory from template config.
- **Decision:** (b).
- **Rationale:** Adding a new provider means writing one new class and registering it — zero changes to `InterviewService`, the engine, or the frontend.
- **Consequences:** Every provider implementation must normalize its response/error shape to the common `InterviewTurnOutput`/error types at the boundary — vendor-specific quirks must never leak upward.
- **Source:** [03-software-architecture.md](../03-software-architecture.md) §4.

### ADR-0003 — HTTP Streaming, Not Firestore-Document Streaming
- **Status:** Accepted
- **Context:** The chat UI needs token-by-token streaming; Firestore writes cost money per write.
- **Options:** (a) Write partial tokens as Firestore document updates (`onSnapshot`-based streaming), (b) a dedicated HTTPS Cloud Function returning a chunked response, consumed via `fetch` + `ReadableStream`.
- **Decision:** (b).
- **Rationale:** (a) could cost 10-50x the Firestore writes per message versus (b), which costs one function invocation regardless of token count.
- **Consequences:** This is the one function using HTTPS instead of Callable Functions, so auth/App Check verification must be done manually inside the handler rather than automatically as Callable Functions provide.
- **Source:** [03-software-architecture.md](../03-software-architecture.md) §6, [09-api-design.md](../09-api-design.md) §2.2.

### ADR-0004 — Bounded State Machine, Not Free-Form Chat
- **Status:** Accepted
- **Context:** "Never ask fixed questions" as literally stated implies unbounded conversation, which is unbounded cost and an unbounded abuse surface.
- **Options:** (a) Fully free-form chat with full memory, (b) a state machine with defined coverage goals, dynamic phrasing, and a hard max-turn/max-token ceiling.
- **Decision:** (b).
- **Rationale:** Preserves full dynamism in *how* the AI asks and what it probes next, while bounding *scope* — cost and respondent fatigue stay predictable.
- **Consequences:** Every template must define coverage goals (Document 5 §1.1); termination logic (Document 3 §5) is now a first-class, testable concern.
- **Source:** [03-software-architecture.md](../03-software-architecture.md) §5, [01-vision-document.md](../01-vision-document.md) §13.3.

### ADR-0005 — Single Structured-Output Call Per Turn (Reply + Classification Together)
- **Status:** Accepted
- **Context:** Original brief implied classifying "after every message" as a separate step from generating the reply.
- **Options:** (a) two LLM calls per turn (reply, then classify), (b) one call returning both via structured output.
- **Decision:** (b).
- **Rationale:** Halves per-turn cost and latency.
- **Consequences:** Every `IAIProvider` implementation must support structured/JSON output reliably — a provider that can't do this well is a weaker Phase 1 candidate.
- **Source:** [03-software-architecture.md](../03-software-architecture.md) §4, [01-vision-document.md](../01-vision-document.md) §13.4.

### ADR-0006 — App Check + Spend Caps Are Mandatory v1 Requirements, Not Backlog Items
- **Status:** Accepted
- **Context:** Anonymous Auth + a public URL is an open door to unmetered LLM spend.
- **Options:** (a) ship without abuse protection, add if abuse happens, (b) ship App Check (enforced) + per-session/per-template/global spend caps from the first production deploy.
- **Decision:** (b).
- **Rationale:** Retrofitting after a bill surprise is the expensive mistake this whole review process exists to prevent.
- **Consequences:** No template can go `live` without a `dailySpendCapUsd`; App Check enforcement (not monitor-only) is required infrastructure before any public deploy.
- **Source:** [06-security-model.md](../06-security-model.md) §3-4, [01-vision-document.md](../01-vision-document.md) §13.2.

### ADR-0007 — Firestore Rules Deny All Direct Client Writes to `sessions`/`messages`
- **Status:** Accepted
- **Context:** A modified frontend could otherwise fabricate sessions, fake classifications, or zero out cost.
- **Options:** (a) allow client writes with rules validating shape, (b) deny all direct client writes; every write with business meaning goes through a Cloud Function.
- **Decision:** (b).
- **Rationale:** No rules-shape is simpler or more robust than "clients cannot write here, period" — (a) is fragile against every new field added later.
- **Consequences:** Every conversational turn, however small, is a server round-trip; there is no "optimistic local write" path for chat messages.
- **Source:** [06-security-model.md](../06-security-model.md) §2.

### ADR-0008 — Single-Operator Tenancy for v1
- **Status:** Accepted (superseding condition tracked, see ADR-0011)
- **Context:** Brief mixed "just you" language with "global SaaS platform" language.
- **Options:** (a) multi-tenant from day one, (b) single operator now, explicit scoped migration later.
- **Decision:** (b), confirmed directly by founder.
- **Rationale:** Avoids building tenant isolation/billing/multi-user auth before a second user exists to justify it; every collection is already keyed by `templateId` in a way that migrates additively to `orgId` scoping later.
- **Consequences:** Admin auth is a single hardcoded claim, not a role system, until the trigger condition (a second organization) fires.
- **Source:** [01-vision-document.md](../01-vision-document.md) §13.5, [00-assumptions-register.md](../00-assumptions-register.md) A1.

### ADR-0009 — npm Workspaces Monorepo, Not Nx, Not Separate Repos
- **Status:** Accepted
- **Context:** Frontend and backend need to share TypeScript types for Firestore documents and provider contracts.
- **Options:** (a) separate repos, (b) Nx monorepo, (c) npm workspaces monorepo with a `libs/shared-types` package.
- **Decision:** (c).
- **Rationale:** Solves the one real cross-cutting problem (shared types) with the least new tooling; Nx's affected-graph tooling isn't justified for two deployable units.
- **Consequences:** No built-in affected-test-running automation; acceptable at current scale.
- **Source:** [07-folder-structure.md](../07-folder-structure.md) §1.

### ADR-0010 — Blaze Plan Required From Day One
- **Status:** Accepted
- **Context:** Cloud Functions on Spark (free) plan cannot make outbound calls to third-party APIs, and every LLM call is one.
- **Options:** (a) attempt Spark plan and hit a hard wall immediately, (b) Blaze plan from the start, architected to stay near $0 via spend caps rather than relying on a hard free ceiling.
- **Decision:** (b).
- **Rationale:** Blaze retains the same free-tier quotas as Spark; the only change is a billing account on file plus the ability to exceed quotas (which spend caps prevent from happening unintentionally).
- **Consequences:** A billing account must be linked before any deployment that calls an AI provider; local Firebase Emulator Suite usage does **not** require Blaze (emulated Functions run as local Node processes, not real GCP infrastructure) — this is the basis for testing locally with a real AI provider key before production billing is even set up.
- **Source:** [01-vision-document.md](../01-vision-document.md) §13.1, [16-cost-estimation.md](../16-cost-estimation.md) §1.

### ADR-0011 — OpenRouter as the Phase 1 AI Provider Implementation
- **Status:** Accepted
- **Context:** Phase 1 needs exactly one working `IAIProvider` implementation to prove the walking skeleton (Document 12 §3). The founder specified OpenRouter specifically, and separately reiterated that OpenAI/Claude/Gemini/DeepSeek/Qwen/local models must all be reachable via configuration only.
- **Options:** (a) OpenAI direct as originally planned in Document 14 §2, (b) OpenRouter as the sole Phase 1 provider.
- **Decision:** (b).
- **Rationale (including a genuine architectural bonus worth stating plainly):** OpenRouter's API is OpenAI-wire-compatible and proxies to OpenAI, Anthropic, Google, DeepSeek, Qwen, and many others through **one account and one API key**, selecting the underlying model via a `provider/model` string (e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, `google/gemini-flash-1.5`, `deepseek/deepseek-chat`, `qwen/qwen-2.5-72b`). This means **one `OpenRouterProvider` implementation of `IAIProvider` gives InsightAI configuration-only switching across nearly every vendor named in the brief**, not just OpenRouter itself — a direct, concrete win from the founder's own multi-provider requirement. `IAIProvider` remains vendor-agnostic regardless — a direct-to-vendor provider (bypassing OpenRouter for latency/cost/local-model reasons) is still a valid future implementation of the same interface, not a redesign.
- **Consequences:** Template config's `aiProvider` field conceptually becomes "OpenRouter model string" for Phase 1 rather than a small enum of vendor names — Document 5 §1's `aiProvider`/`defaultModel` fields are updated accordingly (see amendment note in that document). Rate limits and uptime are now also dependent on OpenRouter as an intermediary, not just the underlying model vendor — a new, narrow dependency risk, logged to the risk register as R13.
- **Source:** This session; supersedes Document 14 §2's "OpenAI direct" MVP default for the *implementation* choice (the underlying model reachable through OpenRouter can still be an OpenAI model, so the cost/quality assumptions in Document 16 remain approximately valid).

### ADR-0012 — Cross-Device Resume via Signed Resume Token
- **Status:** Accepted
- **Context:** Original design (Document 5 §2) treated a session as bounded to one anonymous Auth UID for its whole lifetime, implicitly single-device. Founder requires a respondent be able to resume an in-progress interview from a different device via a saved/shared link.
- **Options:** (a) same-browser-only resume (rely on Anonymous Auth's existing persistence, near-zero new work), (b) a signed, high-entropy resume token stored per session, exchanged via a dedicated `resumeSession` Cloud Function that re-binds the session to a new anonymous UID from whatever device opens the resume link.
- **Decision:** (b), per founder's explicit choice.
- **Rationale:** Only (b) satisfies "resume from any device." The token must be high-entropy (unguessable — brute force must be infeasible) since possessing it is, by design, sufficient to continue someone else's interview; this is an accepted, explicit capability-based access model, not an oversight.
- **Consequences (new attack surface, mitigated explicitly, not silently accepted):**
  - Token is generated server-side at `startSession` time, stored in a dedicated `sessionResumeTokens/{token} → sessionId` lookup document (O(1) get, no query/scan) — never as the session document's own ID, so the session ID and the resume capability are decoupled.
  - Token has a default expiration (7 days — configurable, see amendment to Document 5 §8) after which `resumeSession` rejects it and the interview is treated as permanently abandoned.
  - `resumeSession` is rate-limited and App-Check-gated identically to `startSession` (Document 6 §3) — resume attempts are exactly as capable of being scripted/abused as session starts, so they get the same defenses, not weaker ones.
  - Re-binding `respondentUid` on resume is a server-side (Admin SDK) write only — consistent with ADR-0007, the client never writes this field directly.
- **Source:** This session; amends [05-firestore-collections.md](../05-firestore-collections.md), [06-security-model.md](../06-security-model.md), [09-api-design.md](../09-api-design.md), [10-cloud-functions-design.md](../10-cloud-functions-design.md) — see amendment notes appended to each.

---

### ADR-0013 — Streaming + Structured Output via Delimiter Marker, Not JSON-Mode-For-The-Whole-Response
- **Status:** Accepted
- **Context:** ADR-0003 committed to true token streaming; ADR-0005 committed to one structured-output call per turn. These are in tension: forcing the whole completion into JSON mode (or a tool call) to get structure means the raw streamed deltas are JSON syntax fragments (`{"replyText": "Hi...`), which cannot be shown to the respondent as-is without a nontrivial incremental JSON parser.
- **Options:** (a) JSON-mode/tool-calling for the entire response, simulate streaming client-side by chunking the already-complete text (fast to build, but not real token streaming — added latency before any text appears since the full completion must finish first), (b) instruct the model to emit natural-language reply text first, then a fixed delimiter marker, then a single-line JSON classification blob — stream raw deltas up to the marker as real reply text, buffer everything after as the classification payload.
- **Decision:** (b), implemented via a small buffered marker-splitting utility (`MarkerStreamSplitter`) that holds back `marker.length - 1` characters at all times so a marker split across two stream chunks is never mistakenly flushed as visible text.
- **Rationale:** Preserves genuine real-time token streaming (the actual UX goal behind ADR-0003) while keeping the one-call-per-turn cost/latency win (ADR-0005) — without needing a real-time streaming JSON parser.
- **Consequences:** If the model fails to emit the marker/JSON correctly, the provider falls back to treating the entire output as reply text with a null/default classification (never crashes the turn — Document 10 §5's "degrade gracefully" philosophy) and logs this as a malformed-response case. The classification is only available to the client/persistence layer *after* the marker is reached, meaning respondent-visible streaming genuinely stops exactly where the human-facing reply ends, not before.
- **Source:** This session; implements [03-software-architecture.md](../03-software-architecture.md) §6 and [10-cloud-functions-design.md](../10-cloud-functions-design.md) §2 concretely. `apps/functions/src/providers/openrouter.provider.ts`, `marker-stream-splitter.ts`.

### ADR-0014 — App Check Enforcement Skipped Only Under the Functions Emulator
- **Status:** Accepted
- **Context:** Document 6 §3 makes App Check enforcement mandatory for any public deployment. Standing up a real reCAPTCHA site key (or the App Check emulator) purely to run a local walking-skeleton demo (Document 12 Phase 1, before any real project/public URL exists) is disproportionate at this stage.
- **Options:** (a) require full App Check wiring before any local testing is possible, (b) detect the Functions Emulator at process start (`process.env.FUNCTIONS_EMULATOR === 'true'`, set automatically by the emulator, never present in a real deployment) and skip App Check verification only in that case.
- **Decision:** (b).
- **Rationale:** Keeps Document 6 §3's requirement fully intact for every real deployment (the flag is computed once at process start from an env var the emulator controls, not something a request can influence) while unblocking local development immediately.
- **Consequences:** Local emulator testing is not a security test of the App Check layer itself — that verification remains a Document 20 Production Checklist item, checked against a real deployed environment, per that document's own "verified against prod, not dev" rule.
- **Source:** This session; `apps/functions/src/security/environment.ts`, applied in `startSession.ts`, `resumeSession.ts`, `sendMessage.ts`.

### ADR-0015 — `npm install --legacy-peer-deps` Required for the Web App
- **Status:** Accepted (tracked for cleanup)
- **Context:** `@angular/fire@20.0.1` depends on `@angular/platform-browser-dynamic@20.0.7`, which pins an exact `@angular/common@20.0.7` peer — incompatible with the `^20.3.0` Angular packages `ng new` scaffolded (ADR-0009's Angular 20 baseline). This is a real version-lag issue in the `@angular/fire` package, not a mistake in this project's own dependency choices.
- **Options:** (a) downgrade the whole Angular toolchain to exactly 20.0.x to match, (b) install with `--legacy-peer-deps` (skips strict peer resolution, doesn't affect what actually gets bundled/run), (c) drop `@angular/fire` and call the Firebase JS SDK directly.
- **Decision:** (b) for now.
- **Rationale:** (a) throws away newer Angular 20.3 fixes for an external package's lag; (c) is a real option (Document 11 doesn't strictly require the `@angular/fire` wrapper, just `Auth`/`Firestore`/`Functions` access) but a larger refactor than justified purely to avoid one flag right now.
- **Consequences:** `npm install` (without the flag) will fail at the root until `@angular/fire` publishes a release with an unpinned/updated peer range. **Action item, not closed:** re-run a plain `npm install` after each `@angular/fire` bump to check if the pin has been fixed, and drop the flag the moment it's no longer needed.
- **Source:** This session; `apps/web/package.json`.

### ADR-0016 — `projects` as a New Root Collection, Additive to (Not Replacing) `templates`
- **Status:** Accepted
- **Context:** The product mission was reframed from "AI interview tool" to "Evidence Engine for Founders" (this session). A founder now starts from a plain-language idea, not a hand-written template. This requires a container above `Template` — one idea/project can span multiple template versions over time (e.g., after a pivot) and accumulates hypotheses that outlive any single template version.
- **Options:** (a) make `Template` the root and bolt idea-intake fields onto it, (b) introduce `projects/{projectId}` as a new root collection, with `Template.projectId` as an optional (nullable) foreign key.
- **Decision:** (b).
- **Rationale:** (a) would conflate "one interview configuration" with "one founder idea that may produce several configurations over time" — the wrong cardinality. (b) is purely additive: every collection, security rule, and function built so far (Documents 4-10) continues to work unchanged; `projectId` is nullable specifically so the already-seeded, hand-authored `egyptians-abroad` template keeps working with zero migration.
- **Consequences:** `TemplateRepository`/`SessionRepository` gain no new required fields. A new `ProjectRepository`/`HypothesisRepository` layer is added alongside, not instead of, the existing ones.
- **Source:** This session; `libs/shared-types/src/firestore/project.types.ts`.

### ADR-0017 — Hypothesis Confidence Is a Deterministic Calculation Over Logged Evidence, Never an LLM-Invented Number
- **Status:** Accepted
- **Context:** Founder explicitly requires: no confidence score may exist before real evidence; once evidence exists, confidence must be *calculated* from supporting/contradicting counts, never a model-invented percentage (this session's "No Fabricated Precision" and "No Confidence Scores Before Evidence" principles).
- **Options:** (a) ask the LLM to output a confidence percentage as part of its structured turn output, (b) the LLM only tags each message as supporting/contradicting/neutral evidence for each active hypothesis (a factual classification task, which structured-output calls are already good at — ADR-0005); a separate, plain deterministic function in application code computes a qualitative confidence label from the accumulated tags.
- **Decision:** (b).
- **Rationale:** An LLM-generated percentage is unfalsifiable and unreproducible — ask it twice, get two different numbers, with no way to audit why. A deterministic function over a logged, inspectable evidence trail is reproducible, explainable ("Medium — 7 supporting, 2 contradicting, 9 total"), and matches the founder's explicit requirement that reasoning, not just conclusions, be visible.
- **Consequences:** Every hypothesis has a `status` computed on read (or cached and invalidated on new evidence — implementation choice, not a product decision) from its `evidenceLog` subcollection, never stored as a source-of-truth number written by the AI provider layer.
- **Source:** This session; `apps/functions/src/services/hypothesis-confidence.util.ts`.

### ADR-0018 — Hypothesis Evidence Tagging Happens in the Same Per-Turn Structured Call, Not a Separate Pass
- **Status:** Accepted
- **Context:** Founder wants an "Evidence History" — a timeline of which interview turns produced supporting/contradicting evidence for which hypothesis — captured starting from the very first interview under this model, not retrofitted later in a Phase 2 batch job.
- **Options:** (a) a separate LLM pass after each interview (or after each session) that re-reads the transcript and tags hypothesis evidence, (b) extend the existing single structured-output call (ADR-0005) that already produces reply + classification to also emit a `hypothesisEvidence: [{hypothesisId, evidenceType, excerpt}]` array, scored against whichever hypotheses are active for the session's project.
- **Decision:** (b).
- **Rationale:** Consistent with ADR-0005's cost/latency reasoning — a second pass would double LLM calls again for data that's available in the same context the model already has during the live turn. Requires passing the project's active hypotheses into the system prompt alongside coverage goals (Document 10 §2 step 5), which is a prompt-construction change only, not a new call.
- **Consequences:** `MessageClassification` (or a sibling field on the persisted message) gains a `hypothesisEvidence` array. Sessions not linked to a project (`templateVersionId` with no `projectId` upstream) simply pass an empty hypotheses list and get an empty array back — fully backward compatible with the existing `egyptians-abroad` template.
- **Source:** This session; `apps/functions/src/providers/openrouter.provider.ts`, `libs/shared-types/src/ai-provider/ai-provider.types.ts`.

### ADR-0019 — Idea Intake Uses Plain JSON-Mode Output, a Second `IAIProvider` Method, Never a Bespoke Direct Call
- **Status:** Accepted
- **Context:** Idea Intake (founder describes their idea → AI drafts title/category/personas/hypotheses/coverage goals/prompt) is founder-facing and reviewed on a screen, not streamed turn-by-turn like the respondent chat. It needs a materially different AI capability shape (one idea description in → one large structured object out) than `generateInterviewTurnStreaming`.
- **Options:** (a) bypass `IAIProvider` and call OpenRouter directly from `IdeaIntakeService` since it's "just an admin tool," (b) add a second method to `IAIProvider` (`generateProjectDraft`) implemented by the same `OpenRouterProvider`, using plain JSON-mode (no marker-splitting needed — nothing here is streamed to an end user).
- **Decision:** (b).
- **Rationale:** ADR-0002/Document 6 §4's rule — no code path may call an LLM without going through the capped, metered provider layer — applies regardless of which persona (respondent vs. founder/operator) is on the other end. "It's just an admin tool" is exactly the kind of exception that quietly erodes an architectural boundary; the cost-cap/audit-log machinery built around the provider layer should cover every LLM call in the system, not just the respondent-facing ones.
- **Consequences:** `OpenRouterProvider` gains a second method alongside the existing streaming one; both share the same constructor/API key. `generateProjectDraft` uses `response_format: {type: 'json_object'}` directly (OpenRouter/OpenAI-compatible) rather than the delimiter-marker trick, since there's no respondent-facing stream to protect from raw JSON syntax here.
- **Source:** This session; `libs/shared-types/src/ai-provider/ai-provider.types.ts`, `apps/functions/src/providers/openrouter.provider.ts`.

### ADR-0020 — Provider Layer Hardening: Structured Errors, Config-Driven Default Model, Explicit Key Checks, Connect Timeout, Consolidated Headers
- **Status:** Accepted
- **Context:** A hardening pass on the existing `OpenRouterProvider` (nothing architectural changed — same `IAIProvider` interface, same factory, same call sites) closed five real gaps found by inspection, not by redesign: (1) a missing/empty API key would only surface as an opaque OpenRouter 401 deep in a fetch call, not a clear upfront message; (2) every failure besides 429 collapsed into one generic `upstream_error` code, making 401/403/5xx/invalid-model indistinguishable in logs; (3) `generateProjectDraft`'s model (`openai/gpt-4o-mini`) and `IdeaIntakeService`'s template-default model were both string literals in two different files, not a single configurable default; (4) no timeout wrapped the initial OpenRouter request, so a hung network call would only ever be bounded by the outer Cloud Function timeout, with no distinct "timeout" error surfaced; (5) the `Authorization`/`HTTP-Referer`/`X-Title` header object was duplicated across three fetch call sites in the same file.
- **Options considered:** For (3) specifically — (a) keep the model hardcoded per call site, (b) a single global `AI_MODEL` env-style config (`defineString`) used as the default wherever a model isn't otherwise specified. **Decision: (b).** This does NOT replace or weaken `Template.aiModel` (Document 5 §1's per-template override, already the correct long-term mechanism per ADR-0011) — it only replaces the *literal* default used by (i) the Idea Intake meta-generation call, which has no template yet, and (ii) `DEFAULT_TEMPLATE_DEFAULTS.aiModel`, the seed value a newly-approved project's template starts with before a founder ever changes it.
- **Rationale:** Every one of these is a robustness/observability improvement with the same public method signatures and the same architectural boundaries (ADR-0002/0005/0011/0013/0019 all untouched) — exactly the "extend, don't redesign" instruction this pass was scoped to.
- **Consequences:** `AIProviderError.code` is now a named union (`AIProviderErrorCode`) instead of four ad-hoc string literals — a small, additive breaking change to the *type*, not to any runtime behavior (existing `'rate_limited' | 'malformed_response' | 'upstream_error'` values are still valid members). `generateProjectDraft` gained a required `model` parameter (previously hardcoded inside the provider) — its one call site (`IdeaIntakeService`) was updated in the same change.
- **Source:** This session; `libs/shared-types/src/ai-provider/ai-provider.types.ts`, `apps/functions/src/providers/openrouter.provider.ts`, `apps/functions/src/composition-root.ts`, `apps/functions/src/services/idea-intake.service.ts`.

### ADR-0021 — Project/Conversation Objective Separation Is a Permanent, Structurally-Enforced Boundary
- **Status:** Accepted
- **Context:** Real validation testing (this session) reproduced an interview terminating after exactly one turn because a single undifferentiated `coverageGoals` field held a founder-level research-plan item ("Interview at least 20 property owners") that the model correctly judged "satisfied" the instant it recognized it was talking to one. Root-caused to Documents 23-24's five-layer redesign (Project Metadata / Research Objectives / Conversation Objectives / Interview Policy / Evidence Contract).
- **Decision — three permanent rules, binding on all future work in this area:**
  1. **Project Objectives (Research Objectives) must never be passed directly to the interview model.** Enforced structurally — no schema field carries them into `TemplateVersion` or any prompt — not by a convention a future change could accidentally violate.
  2. **Conversation Objectives must never modify Research Objectives.** Layer 2 → Layer 3 derivation happens once, at draft-generation time. At runtime, nothing in a live conversation writes back to `Project.researchObjectives` — flow is strictly one-directional.
  3. **Evidence is the only artifact allowed to flow back into research.** The sole channel from a live conversation toward anything research-facing is the Evidence Contract (Document 24) — evidence log entries, classification, hypothesis tags — never a raw conversation objective, never the interview model rewriting founder-authored planning content.
- **Rationale:** The bug that triggered this ADR was a *schema* failure, not a prompt-wording failure — no amount of better instruction text fully closes a leak when both concepts share one field. Structural (type-level) separation is the only enforcement that can't be silently eroded by a future prompt edit.
- **Consequences:** `Project` gains a new `researchObjectives: string[]` field (Layer 2) alongside a renamed `conversationObjectives` (formerly `coverageGoals`, Layer 3). `TemplateVersion` carries `conversationObjectives` only — it has no field capable of carrying Layer 2 content forward at all.
- **Source:** This session; [23-prompt-architecture-redesign.md](../23-prompt-architecture-redesign.md), [24-evidence-model.md](../24-evidence-model.md). Not yet implemented — design approved, code changes pending a further go-ahead.

## Risk Register Addendum (extends [15-technical-risks.md](../15-technical-risks.md))

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R13 | OpenRouter (as an intermediary, ADR-0011) has its own outage/rate-limit/pricing behavior independent of the underlying model vendor | Low-Medium | Medium | `IAIProvider` abstraction (ADR-0002) means adding a direct-to-vendor fallback provider later is a one-file addition, not a redesign; logged as a Phase 2 candidate alongside Claude/Gemini direct implementations |
| R14 | Resume-token possession is, by design, sufficient to continue someone else's interview if the link leaks (e.g., forwarded in a group chat) | Low-Medium | Low-Medium | High-entropy token + 7-day expiration + identical rate-limiting/App Check to session start (ADR-0012) bound the exposure window and make brute-force infeasible; residual risk (a deliberately shared link) is an accepted product tradeoff of the cross-device requirement itself |
