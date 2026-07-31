# InsightAI — Product Requirements Document (PRD)

**Document 2 of 20**
**Depends on:** [01-vision-document.md](./01-vision-document.md) (amendments in §13 are binding here)
**Status:** Draft for approval

---

## 1. Overview

InsightAI has two user-facing surfaces:

- **Public Interview** — an anonymous, unauthenticated chat a respondent opens from a shared URL (`/i/{templateSlug}`).
- **Admin Panel** — a private dashboard, used only by the founder (single-operator scope per Vision §13.5), for creating templates and reviewing insight.

Everything else — the interview engine, classification, synthesis, provider abstraction — is backend behavior that serves these two surfaces.

## 2. Personas

| Persona | Description | Primary Goal |
|---|---|---|
| **The Operator** | Founder/researcher. Technical enough to write a good prompt, not necessarily technical enough (or willing) to touch code for routine work. | Stand up a new interview template in under 10 minutes; get a clear, decision-ready insight report without manually reading every transcript. |
| **The Respondent** | Anyone reached via a shared link (Egyptian abroad, doctor, SME owner, etc.). No account, no prior relationship with the product. | Answer a few honest questions in a conversation that feels short, respectful, and worth their time. Leave without friction. |

## 3. Functional Requirements

### 3.1 Template Management (Operator)

- FR-1: Operator can create, edit, duplicate, archive, and delete an interview template.
- FR-2: Each template has: name, slug (URL segment), description, target audience, base prompt, conversation rules, scoring rules, analysis rules, AI provider selection, temperature, max tokens, language, status (`draft` / `live` / `paused` / `archived`), max turns, and daily spend cap (per Vision §13.2).
- FR-3: A template cannot be set to `live` unless slug, prompt, provider, and daily spend cap are all populated — the system validates this, not the operator's memory.
- FR-4: Changing a `live` template's prompt/rules does not retroactively alter in-progress sessions; the session pins the template version it started with (see Document 4 — versioning).

### 3.2 Public Interview Flow (Respondent)

- FR-5: Opening `/i/{templateSlug}` on a `live` template silently creates an anonymous Firebase Auth session and a new interview session — no visible login step.
- FR-6: Opening a `paused`/`archived`/unknown slug shows a friendly "this interview isn't available" state, not an error page.
- FR-7: The AI sends a configurable welcome message first; the respondent replies; conversation proceeds one message at a time.
- FR-8: UI shows a typing indicator and a brief "thinking" delay before AI responses (Vision: interview must feel alive) — this is a deliberate UX pacing choice, not just a loading state.
- FR-9: Responses render as streaming text (token-by-token or chunked), not appear-all-at-once.
- FR-10: A lightweight progress indicator reflects position toward the template's coverage goals (see §3.3), never a literal "Question 4 of 12" (that reintroduces survey-feeling, which Vision §8.5 forbids).
- FR-11: The interview ends when the state machine's coverage goals are met, the max-turn cap is hit, or the respondent explicitly disengages (e.g., sends a closing signal or goes idle past a timeout). A configurable closing message is shown; the session is marked `completed` or `abandoned` accordingly.
- FR-12: The full flow works correctly on mobile viewport as the primary target (most respondents will open this from a shared social/WhatsApp link on a phone).

### 3.3 Interview Engine (Backend)

- FR-13: The engine is a bounded state machine (Vision §13.3): each template defines coverage goals (topics/themes to extract) rather than a fixed question list. The AI dynamically phrases the next question based on full conversation history and remaining coverage goals.
- FR-14: The engine applies configurable interview methodology framing (JTBD, The Mom Test, Five Whys, Behavioral Interviewing, Root Cause Analysis) as instructed behavior in the system prompt construction, not as separate hardcoded logic paths.
- FR-15: Only one question is ever asked per AI turn.
- FR-16: The engine enforces `maxTurns` and a max-token conversation budget server-side; when reached, it forces a graceful close rather than an abrupt cutoff.
- FR-17: The engine detects and gracefully redirects off-topic, abusive, or prompt-injection attempts from the respondent (e.g., "ignore previous instructions") without breaking character or leaking the system prompt.

### 3.4 Real-Time Classification

- FR-18: After every respondent message, the system extracts (in the same structured-output call as the reply, per Vision §13.4): pain point, industry, customer segment, emotion, urgency, buying intent, problem frequency, estimated money lost, estimated time lost, opportunity signal, and a confidence score.
- FR-19: Extracted data is persisted per-message (Document 4/5 define the exact schema) and is queryable independent of the raw transcript.
- FR-20: Low-confidence extractions are still stored, tagged with their confidence score — never silently dropped. The Admin Panel is responsible for filtering by confidence, not the extraction step.

### 3.5 Post-Interview Synthesis

- FR-21: On session completion, an asynchronous job (Cloud Function trigger) generates: executive summary, customer persona, pain analysis, JTBD breakdown, customer journey, current alternatives, hidden needs, startup opportunities, recommended MVP, recommended pricing, recommended business model, risk analysis, feature requests, and exact respondent quotes.
- FR-22: Synthesis runs once per completed session and is idempotent — re-triggering (e.g., after a retry) must not duplicate records.
- FR-23: Synthesis failures are logged and retried with backoff; a session is never left silently stuck in "processing."

### 3.6 Admin Panel (Operator)

- FR-24: Dashboard shows: interviews today, completion rate, average duration, average pain score, average willingness-to-pay, top countries, top occupations, top pain points, most-mentioned companies/competitors, and AI-generated insight summaries — all filterable by template and date range.
- FR-25: Charts for the above (see Document 8 — Wireframes).
- FR-26: Operator can search and filter individual interviews (by template, date, pain score, keyword/quote content).
- FR-27: Operator can export filtered results as CSV and PDF.
- FR-28: Admin Panel requires authentication distinct from respondent anonymous auth (see Document 6 — Security Model) — even in single-operator scope, the admin surface is never left open on the public internet without a real credential.

### 3.7 AI Provider Abstraction

- FR-29: A single internal interface (`IAIProvider` or equivalent) exposes `generateInterviewTurn()` and any other operation the engine needs; OpenAI, Claude, and Gemini each implement it.
- FR-30: Switching a template's provider is a Firestore field change — zero frontend changes, zero redeploy required for the switch itself.
- FR-31: Provider-specific failures (rate limit, timeout, malformed response) are caught inside the provider implementation and normalized to a common error type before reaching engine logic.
- FR-32: (Future-proofing, not built now) The interface must not assume any capability unique to one provider (e.g., a specific function-calling wire format) — normalize at the boundary.

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Cost** | Architected to run near $0 at low volume on Blaze plan; every template has a hard daily spend cap; no code path may call an LLM without going through the capped, metered provider layer. |
| **Performance** | First AI response begins streaming within ~2–3s perceived (thinking delay is intentional, but must never feel broken). |
| **Availability** | Public interview surface should degrade gracefully (friendly error, not a stack trace) on any backend failure. |
| **Scalability** | Architecture must not require a rewrite to go from tens to hundreds of thousands of respondents — see Document 17 (Scaling Strategy). Actual v1 traffic is expected to be small; this is a design constraint, not a v1 load target. |
| **Security** | Anonymous auth, Firestore rules, Cloud Function input validation, App Check, rate limiting, prompt-injection handling, sensitive-data masking — all mandatory for v1, not deferred (Document 6). |
| **Localization** | Interview language is a per-template config field from v1; UI chrome (buttons, labels) ships in English first, structured so translation is a config/data change later. |
| **Observability** | Every LLM call, its cost, latency, and outcome is logged to an audit trail — required for the spend-cap enforcement in FR-2/NFR-Cost to function at all. |

## 5. Key User Stories (representative, not exhaustive)

- As the Operator, I can paste a prompt describing "Doctors in Egypt struggling with patient no-shows," set a $2/day cap, and get a live shareable link within minutes.
- As the Operator, I open the dashboard and see, without reading a single transcript, that "no-shows cost an average of 3 hours/week" is the top pain point this week, backed by 14 verbatim quotes.
- As a Respondent, I click a link from a WhatsApp group, answer 6–10 short questions in a conversation that never feels like a form, and leave in under 4 minutes.
- As the Operator, I change the AI provider for a template from OpenAI to Gemini because of a rate-limit issue, without touching the frontend or redeploying.
- As the Operator, an interview template that somehow gets flooded with automated traffic stops itself once it hits its daily spend cap, and I get a clear record of why, instead of an unexpected bill.

## 6. Out of Scope for v1 (tracked, not abandoned)

Per Vision §10, plus PRD-specific exclusions:

- Voice, WhatsApp, Telegram, Messenger, Email, SMS channels.
- Multi-tenant signup/billing (single-operator scope, Vision §13.5).
- Respondent accounts of any kind.
- Real-time collaborative admin panel (multiple simultaneous operator logins) — single-operator makes this unnecessary for now.

## 7. Assumptions

- The operator (you) is the sole admin user for the v1 lifetime of this scope.
- Respondent volume in early v1 is small enough (dozens to low hundreds of interviews) that free-tier-adjacent costs stay negligible even without perfect optimization — but the caps and metering ship anyway, because retrofitting cost control after a bill surprise is the expensive mistake we're avoiding.
- At least one of OpenAI/Claude/Gemini API keys will be available in the deployment environment at all times; the system does not need to function with zero configured providers.

## 8. Open Decisions Carried Forward

These are flagged here so they're resolved in the specific document responsible, not forgotten:

- Exact Firestore schema and versioning strategy for templates → **Document 4/5**.
- Exact security rules and App Check configuration → **Document 6**.
- Streaming implementation mechanism (chunked HTTP vs. Firestore-doc-based simulated streaming) → **Document 9/10**.
- Exact coverage-goal representation for the interview state machine → **Document 10** (Cloud Functions Design).

---

**Approval needed:** Confirm this PRD before I proceed to Document 3 (Software Architecture Document), or flag changes now — architecture will be built directly on these requirements.
