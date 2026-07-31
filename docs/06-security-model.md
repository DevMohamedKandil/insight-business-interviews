# InsightAI — Security Model

**Document 6 of 20**
**Depends on:** [05-firestore-collections.md](./05-firestore-collections.md)
**Status:** Draft for approval
**Companion:** [00-assumptions-register.md](./00-assumptions-register.md)

---

## 1. Threat Model

Before rules, name the threats. A public, login-free, AI-backed endpoint has a specific and unusual risk profile compared to a typical CRUD app: **the attacker doesn't need to steal data to hurt you — they can just make the AI talk, and every word it says costs money.** The threats below are ranked by realistic likelihood × cost, per the founder's explicit instruction to challenge cost-blind assumptions (Vision §13.2).

| # | Threat | Why It's Realistic Here Specifically | Primary Mitigation |
|---|---|---|---|
| T1 | **Scripted/automated flooding of a public interview URL** to run up LLM spend | No login barrier by design (PRD FR-5); URL is meant to be shared publicly | App Check (§3) + per-template daily spend cap (§4) + per-session turn cap |
| T2 | **Prompt injection** — respondent tries to override the system prompt ("ignore previous instructions, instead...") to extract the prompt, jailbreak the persona, or generate unrelated content at InsightAI's expense | Respondent input is, by product design, sent directly into an LLM conversation with real budget behind it | Input/output guarding in the Service Layer (§5), never trusting the model to self-police |
| T3 | **Firestore rule bypass** — a client crafts a direct Firestore write (bypassing Cloud Functions entirely) to fabricate sessions, fake completions, or corrupt analytics | Firestore Security Rules are the *only* backstop once someone has valid Firebase Auth credentials (anonymous auth is trivial to obtain) | Rules that assume the client is hostile (§2) — write access is far narrower than what the app's own UI needs, by design |
| T4 | **Admin surface exposure** — the Admin Panel, even single-operator, is served from the same public Hosting deployment | A single leaked link or misconfigured route could expose the dashboard | Real Firebase Auth (email/password or Google sign-in) with a custom claim gate, never anonymous auth, for `/admin/*` (§6) |
| T5 | **Sensitive data exposure** — respondents may volunteer PII (phone numbers, exact salary, company-identifying detail) mid-conversation | Open-ended conversation format actively invites this kind of disclosure, more so than a structured form | Masking pipeline before persistence into aggregate/dashboard-facing collections (§7) |
| T6 | **Synthesis/classification data poisoning** — a malicious respondent deliberately feeds false but plausible-sounding pain points to corrupt aggregate insight | Any AI classification pipeline is one prompt away from feeding on adversarial input | Confidence scoring (already in schema) surfaced in the dashboard, plus abuse-flagging (§5) excluding flagged sessions from default aggregates |

## 2. Firestore Security Rules — Design Principles Before Rules Themselves

**Core principle:** the client (Angular app) should have the *minimum* Firestore access needed for real-time reads (so the UI can use `onSnapshot` for live updates), and essentially **no direct write access** to anything that affects business logic, cost, or analytics integrity. All writes with business meaning go through Cloud Functions, which run with elevated (Admin SDK) privileges and enforce the actual rules in code, not in the declarative rules language.

**Why not just do everything in Firestore Rules?** Firestore Rules can validate document shape and simple field constraints, but cannot: call the AI provider, enforce the spend cap against a running total under concurrent writes (rules aren't transactional across documents), or run the classification pipeline. Rules are the last line of defense against a bypassing client, not the primary business-logic enforcement layer — that's the Cloud Functions Service Layer (Architecture §2). This is a deliberate division of responsibility, not a shortcut.

### 2.1 Rules Summary by Collection

| Collection | Client Read | Client Write | Notes |
|---|---|---|---|
| `templates/{id}` (public fields only) | Allow if `status == 'live'` **and** limited to fields needed to render the interview shell (name, welcome message, language) — not `prompt`/`conversationRules`/`analysisRules`, which are never sent to the client at all (they're consumed server-side only) | Deny | The full template document is never readable by the public client — this is a security rule, not just an app convention, so even a compromised frontend can't exfiltrate prompt engineering |
| `templates/{id}` (admin) | Allow if `request.auth.token.admin == true` | Allow if `request.auth.token.admin == true` | Custom claim, set only via a privileged one-time Cloud Function (§6) |
| `sessions/{id}` | Allow if `resource.data.respondentUid == request.auth.uid` OR admin claim | **Deny direct client writes entirely** | Session creation/update happens only via Callable Functions (`startSession`, the turn-processing function) — see rationale below |
| `sessions/{id}/messages/{id}` | Allow if parent session's `respondentUid == request.auth.uid` OR admin claim | Deny | Same rationale — messages are written by the Cloud Function after classification, never directly by the client |
| `synthesisReports`, `quotes`, `opportunities`, `analyticsRollups` | Admin claim only | Deny (system-only, Admin SDK bypasses rules) | Respondents never see aggregate/derived data; only the operator does |
| `aiProviderConfigs`, `configurations` | Admin claim only | Admin claim only (non-secret fields) | Actual API keys are never stored here (§8) |
| `auditLogs` | Admin claim only | Deny (system-only) | |

**Why deny direct client writes to `sessions`/`messages` even for the respondent's own session?** This is the single most important rule in the document, so it's worth over-explaining: if the client could write its own session/message documents directly, a modified frontend (trivial to build — it's just a public web app) could fabricate a completed interview with fake glowing responses, or directly write a `classification` object claiming zero cost and maximum "opportunity" score, poisoning the analytics the entire product exists to produce. **Every respondent message must flow through a Cloud Function that (a) checks the spend cap, (b) calls the real AI provider, (c) writes the real result.** The client only ever *reads* its own session via `onSnapshot` for the live chat UI, and *calls* a function to send a message — it never writes conversation state directly.

**Alternative considered:** Allow the client to write its own message documents, with rules validating shape (e.g., "classification field must be absent on client-authored writes"). **Rejected** — this is fragile (every new classification field added later requires an accompanying rule update, and getting one wrong reopens the hole) versus the chosen approach, which is structurally immune: there is no rules-shape clever enough that's simpler than "clients cannot write here, period."

## 3. Bot & Abuse Protection

- **Firebase App Check is mandatory, enforced (not monitor-only) mode**, on both the Angular app and every Callable/HTTPS Function that touches an AI provider, from the first production deploy — not added after an incident (Vision §13.2). Provider: reCAPTCHA Enterprise (or v3) for web.
- **Rationale for enforced over monitor-only:** monitor-only mode logs violations but still lets requests through — for a threat model where the cost of a single unmitigated bad actor is "unbounded LLM spend," monitoring after the fact is not an acceptable mitigation; the request must be rejected before it reaches the AI provider.
- **Assumption carried from the register (A5):** enforced App Check may reject a small percentage of legitimate users on unusual browsers/configurations. This is accepted because the alternative risk (T1) is financial, not cosmetic. The Admin Dashboard must surface an "App Check rejection count" metric from day one so this tradeoff is visible and tunable, not silently costing respondents without anyone noticing.
- **Rate limiting**, layered on top of App Check: a per-IP-hash + per-anonymous-UID sliding window limit (e.g., max N session-starts per hour) enforced inside the `startSession` Callable Function, backed by a short-TTL Firestore or in-memory-per-instance counter. **Alternative considered:** Cloud Armor / external WAF-level rate limiting. **Rejected for v1** — adds infrastructure and cost (Cloud Armor is not part of the Firebase free/Blaze baseline) disproportionate to current threat scale; function-level rate limiting is revisited in Document 17 if traffic patterns justify it.

## 4. Spend Cap Enforcement (Mechanism, Not Just Policy)

This is the concrete implementation of the mandatory requirement from Vision §13.2 / PRD FR-2:

1. Before every AI provider call, the turn-processing function reads the current `session.estimatedCostUsd`, the parent template's `dailySpendCapUsd`, and today's `analyticsRollups/{templateId}_{date}.estimatedCostUsd`.
2. If either the per-session running cost projected forward (current + estimated next-turn cost) would exceed a per-session ceiling, **or** the template's daily rollup total would exceed `dailySpendCapUsd`, **or** the global `configurations/global.globalDailySpendCapUsd` would be exceeded — the function short-circuits, returns a graceful closing message to the respondent (PRD FR-11 style graceful close), and marks the session `abandoned` with a specific `abandonReason: 'spend_cap'`.
3. This check-then-call sequence has a **known, accepted race condition**: two concurrent requests could both pass the check before either's cost is recorded, technically allowing a brief overshoot. **This is accepted, not overlooked:** perfectly atomic spend-cap enforcement would require a Firestore transaction wrapping the entire external AI API call (transactions should never wrap slow external I/O — this is a Firestore/general distributed-systems best practice, not an InsightAI-specific shortcut), which would materially hurt latency (PRD NFR-Performance) for a race window that, at realistic concurrency for a single-operator v1 product, is vanishingly unlikely to matter financially. Logged here explicitly so a future engineer scaling this up knows this tradeoff was deliberate and knows the trigger condition for revisiting it (sustained high concurrent traffic on a single template).

## 5. Prompt Injection Handling

Multi-layered, because no single layer is sufficient on its own:

1. **System prompt hardening:** the constructed system prompt (Architecture §5) explicitly instructs the model to never reveal its instructions, never adopt a new persona requested by the user, and to redirect off-topic/manipulative input back to the interview topic in character — this is instruction-level, not a guarantee.
2. **Output-side detection:** the same structured-output call that produces the classification also includes a boolean-style signal the model itself reports if it detected an injection attempt in the input it just processed — logged to `auditLogs` as an `abuse_flag` and contributing to `session.abuseFlag`.
3. **Never trust the model's self-report alone:** a lightweight independent heuristic check (pattern match for common injection phrasing: "ignore previous instructions", "you are now", "system prompt", etc.) runs in the Service Layer on every respondent message, independent of what the LLM itself reports — because a sufficiently clever injection could suppress the model's own self-report.
4. Flagged sessions are **not deleted or hidden** — they remain fully visible to the operator in a dedicated filtered view (T6 mitigation) but are excluded from default aggregate rollups so one adversarial respondent doesn't skew "top pain points" for everyone else reading the dashboard.

## 6. Admin Authentication

- **Decision:** Real Firebase Authentication (email/password, or Google Sign-In) for the operator, with a custom claim `admin: true` set via a one-time, manually-invoked privileged Cloud Function (never a public signup flow) — the Admin Panel checks this claim, both in Firestore Rules (§2.1) and as an Angular route guard.
- **Why not anonymous auth for admin too, given single-operator scope (Assumption A1)?** Because "single operator" describes the *product* scope, not an excuse to weaken the *security* posture of the one surface that can read every respondent's raw transcript and every cost/business metric. This is exactly the kind of shortcut the founder's "challenge me" instruction exists to catch — anonymous auth for the admin surface would be trivially reusable by anyone who discovers the `/admin` route, which is served from the same public Hosting deployment (T4).
- **Alternative considered:** IP allowlisting for the admin route instead of real auth. **Rejected** — brittle (breaks the moment the operator is on a different network/mobile), and Firebase Hosting doesn't natively support IP-based access rules without additional infrastructure (Cloud Armor, again disproportionate per §3's rationale) — real auth is both simpler and stronger here.

## 7. Sensitive Data Masking

- A masking step runs on every respondent message **before** it is persisted to `messages.text`, and again on any text propagated into `quotes`/`opportunities`/`synthesisReports`: regex-based detection of phone numbers, email addresses, and explicit national ID-style number patterns, replaced with a typed placeholder (e.g., `[phone number]`) — not deleted silently, so the *fact* that a phone number was mentioned (potentially itself a signal, e.g., "gave out their number unprompted" could correlate with urgency) isn't lost, only the raw value.
- **Explicit non-goal:** this is pattern-based masking, not a guarantee of perfect PII removal (a respondent could describe identifying detail in prose that no regex catches). This limitation is logged as an assumption (A9, below) rather than implied to be solved.
- Financial figures (money lost, mentioned salary) are **not** masked — they are exactly the data the product exists to extract (PRD FR-18 `moneyLostEstimate`) and are not, on their own, PII.

## 8. Secrets Management

- AI provider API keys are stored in **Google Secret Manager**, referenced by Cloud Functions via the standard Firebase Functions secrets integration (`defineSecret`) — never in Firestore (per §2.1, `aiProviderConfigs` holds only non-secret metadata), never in environment variables committed to source, never in client-reachable code.
- **Rationale:** Secret Manager is the platform-native mechanism specifically for this purpose, is already covered under the same Blaze billing (Vision §13.1) with no separate service to provision, and integrates with Cloud Functions' automatic secret injection at invocation time — no custom secret-fetching code needed.

## 8A. Amendment (ADR-0012) — Cross-Device Resume Threat

| # | Threat | Why It's Realistic Here Specifically | Primary Mitigation |
|---|---|---|---|
| T7 | Resume-token leakage — anyone holding a respondent's resume link can continue that respondent's interview as if they were the original respondent | This is an inherent consequence of "resume from any device via a link" (ADR-0012) — the token, not the device or account, is the credential | High-entropy token (`crypto.randomBytes(24).toString('base64url')` or equivalent — 192 bits, brute force infeasible), default 7-day expiry (Document 5 §9A), identical App Check + rate limiting on `resumeSession` as on `startSession` (§3 below extends to this function explicitly), `lastUsedAt` tracked for operator visibility |

**Rules table amendment (extends §2.1):**

| Collection | Client Read | Client Write |
|---|---|---|
| `sessionResumeTokens/{token}` | Deny (all callers, including admin — the token's own value should never need to be read back out through a general query; the one place it's legitimately consumed is inside `resumeSession`, which uses the Admin SDK and bypasses rules entirely) | Deny |

**§3 (Bot & Abuse Protection) extension:** the rate-limiting mechanism described there (per-IP-hash + per-anonymous-UID sliding window) applies identically to `resumeSession` as to `startSession` — a resume attempt is exactly as scriptable as a session start, so it must not be treated as a lower-risk operation just because it's a secondary entry point.

**§4 (Spend Cap Enforcement) extension:** a resumed session re-enters the exact same spend-guard check on its next `sendMessage` call — resuming does not grant a fresh budget; `session.estimatedCostUsd` carries over unchanged, since it's a property of the session, not of any particular device/UID that has been bound to it.

## 9. New Assumptions Introduced by This Document

| # | Assumption | Rationale | Impact if False |
|---|---|---|---|
| A9 | Regex/pattern-based PII masking catches the common, structured cases (phone numbers, emails, ID numbers) but is not exhaustive against free-text-described identifying detail. | Building an ML-based PII detector is disproportionate engineering effort for v1 scale and is a known-hard, never-fully-solved problem even at large scale. | If a specific sensitive-disclosure incident occurs, response is manual review + rule refinement, not a claim that masking is complete. Tracked as a Document 15 (Technical Risks) item. |
| A10 | The check-then-call spend-cap race condition (§4.3) will not produce a materially damaging overshoot at realistic v1 concurrency (Assumption A3: low volume). | Full transactional atomicity around an external API call is a Firestore anti-pattern and would hurt latency for a real risk that's currently negligible. | If traffic concentration ever makes concurrent-request races common on one template, this must be revisited — explicit trigger condition, not a silent gap. |

*(Also appended to [00-assumptions-register.md](./00-assumptions-register.md).)*

---

**Approval needed:** Confirm this security model before Document 7 (Folder Structure), which organizes the codebase around these exact layer and access boundaries.
