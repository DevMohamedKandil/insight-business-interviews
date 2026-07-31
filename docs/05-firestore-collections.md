# InsightAI — Firestore Collections Specification

**Document 5 of 20**
**Depends on:** [04-database-design.md](./04-database-design.md)
**Status:** Draft for approval
**Companion:** [00-assumptions-register.md](./00-assumptions-register.md)

---

## 0. Reading This Document

Each collection is specified with: purpose, exact field schema (name, type, nullability), subcollections, required composite indexes, and the write pattern that populates it (which service/trigger writes it, and how often). Where a design choice had a real alternative, the alternative is compared explicitly — this is meant to be reviewable by a security engineer and a future engineer without either needing to ask "why is it like this?" in a meeting.

---

## 1. `templates/{templateId}`

**Purpose:** The configuration root for one interview type (e.g., "Egyptians Abroad"). Editable by the operator only.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `name` | string | No | Display name, e.g. "Egyptians Abroad" |
| `slug` | string | No | URL segment; unique, immutable once first published (changing it breaks shared links) |
| `description` | string | No | Operator-facing, not shown to respondents |
| `targetAudience` | string | No | Free text, informs prompt construction |
| `currentVersionId` | string (ref) | No | Points to `versions/{versionId}` — the live/editable content lives in the version, not here (see §1.1) |
| `status` | enum: `draft`, `live`, `paused`, `archived` | No | Gates whether `/i/{slug}` resolves (PRD FR-3, FR-6) |
| `aiProvider` | enum: `openai`, `claude`, `gemini` | No | Resolved by `AIProviderFactory` (Architecture §4) |
| `temperature` | number (0.0–2.0) | No | Passed through to provider |
| `maxTokensPerTurn` | number | No | Per-turn ceiling, distinct from session-level budget |
| `maxTurns` | number | No | Hard session cap (PRD FR-16) |
| `dailySpendCapUsd` | number | No | Enforced by `SpendGuard` service before every LLM call (PRD FR-2/amendment) — **mandatory field; template cannot go `live` without it (PRD FR-3)** |
| `language` | string (BCP-47, e.g. `ar`, `en`) | No | Drives system prompt language instruction |
| `welcomeMessage` | string | No | First message shown, config not code |
| `closingMessage` | string | No | Shown on completion |
| `createdAt` / `updatedAt` | timestamp | No | Standard audit fields |
| `createdBy` | string (uid) | No | Admin uid; even in single-operator scope, this is populated for audit-trail continuity if a second admin is ever added (Assumption A1) |

### 1.1 Subcollection: `templates/{templateId}/versions/{versionId}`

**Rationale for a subcollection instead of an array-of-objects field on the template:** an array field would force every session to either embed a full copy of the version content (duplicating potentially large prompt text across thousands of sessions) or re-read the parent template document and index into the array (fragile once more than a handful of versions accumulate, and it re-reads *all* versions on every read even though only one is needed). A subcollection lets a session hold a single small reference (`templateVersionId`) and fetch exactly one version document when needed — O(1) read, no growth-over-time cost. This directly implements the versioning strategy from Document 4 §3.

| Field | Type | Notes |
|---|---|---|
| `prompt` | string | The base system prompt content |
| `conversationRules` | string | Methodology framing (JTBD/Mom Test/Five Whys instructions) |
| `scoringRules` | string | How to derive confidence/urgency/etc. |
| `analysisRules` | string | Coverage goals — structured as a list (see below) |
| `coverageGoals` | array of `{ id: string, description: string }` | Small, bounded list (typically 4-10 items) — safe as an embedded array because it's authored by the operator and size-bounded by prompt-design practicality, unlike a session's message history which grows unboundedly |
| `publishedAt` | timestamp | |

**Alternative considered:** Storing the entire template as one document with a `history` array of past full configs. **Rejected** because Firestore documents have a 1 MiB limit (Assumption A4) and full prompt text repeated across many versions could approach it over a template's lifetime; the subcollection has no such ceiling.

## 2. `sessions/{sessionId}`

**Purpose:** One respondent's interview instance — the aggregation root for the conversation.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `templateId` | string (ref) | No | |
| `templateVersionId` | string (ref) | No | Pinned at session creation (PRD FR-4) |
| `templateName`, `templateSlug` | string | No | Denormalized (Document 4 §5) for list/search views without a join |
| `respondentUid` | string | No | Anonymous Auth UID |
| `status` | enum: `active`, `completed`, `abandoned` | No | |
| `startedAt` / `endedAt` | timestamp | Nullable (`endedAt`) | |
| `turnCount` | number | No | Incremented on each message write; compared against `maxTurns` |
| `coverageGoalsSatisfied` | array of string (goal ids) | No | Drives termination condition (Architecture §5) |
| `estimatedCostUsd` | number | No | Running total; checked against `dailySpendCapUsd` before each turn |
| `topPainPoint`, `topUrgency`, `respondentCountry`, `respondentOccupation` | string, nullable | Yes | Denormalized latest-extraction summary fields (Document 4 §5) for the Admin session list view |
| `synthesisReportId` | string (ref), nullable | Yes | Set once post-interview synthesis completes (PRD FR-21) |
| `abuseFlag` | boolean | No, default `false` | Set by prompt-injection/off-topic detection (PRD FR-17); flagged sessions are excluded from aggregate analytics by default, visible only in a dedicated "flagged" admin view |

### 2.1 Subcollection: `sessions/{sessionId}/messages/{messageId}`

**Rationale for subcollection over embedded array:** conversation history grows per turn, unboundedly in principle (bounded in practice only by `maxTurns`), which is exactly the pattern Firestore's array-field limitations warn against (Assumption A4). A subcollection also lets the classification data per message be queried independently (PRD FR-19: "extracted data is persisted per-message... queryable independent of the raw transcript") without reading the whole transcript.

| Field | Type | Notes |
|---|---|---|
| `role` | enum: `assistant`, `respondent` | |
| `text` | string | Masked per Document 6 sensitive-data rules before persistence if respondent-authored |
| `turnIndex` | number | Ordering, avoids relying on `createdAt` alone under clock skew |
| `createdAt` | timestamp | |
| `classification` | map, nullable (null for assistant messages) | See below |

`classification` map (populated only on respondent messages, in the same structured-output call as the AI's reply — Architecture §4):

```
{
  painPoint: string | null,
  industry: string | null,
  customerSegment: string | null,
  emotion: string | null,
  urgency: 'low' | 'medium' | 'high' | null,
  buyingIntent: 'none' | 'low' | 'medium' | 'high' | null,
  problemFrequency: string | null,
  moneyLostEstimate: number | null,
  timeLostEstimateHours: number | null,
  opportunitySignal: boolean,
  confidenceScore: number  // 0.0–1.0, PRD FR-20: always stored, never dropped for being low
}
```

## 3. `synthesisReports/{reportId}`

**Purpose:** The end-of-interview deliverable (PRD FR-21). One per completed session, created idempotently (PRD FR-22).

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string (ref) | |
| `templateId` | string (ref) | Denormalized for cross-session aggregation |
| `executiveSummary`, `persona`, `painAnalysis`, `jtbd`, `customerJourney`, `currentAlternatives`, `hiddenNeeds`, `recommendedMvp`, `recommendedPricing`, `recommendedBusinessModel`, `riskAnalysis` | string (each) | Long-form generated text; each its own field (not one blob) so the Admin Panel can render/export sections independently |
| `startupOpportunities` | array of `{ title: string, description: string, confidence: number }` | Bounded (small N per interview) |
| `featureRequests` | array of string | |
| `status` | enum: `pending`, `completed`, `failed` | Supports FR-23 (never silently stuck) |
| `generationAttempts` | number | Retry tracking |
| `createdAt` | timestamp | |

**Idempotency mechanism (PRD FR-22):** the triggering Cloud Function uses `sessionId` as a deterministic sub-check — it queries for an existing `synthesisReports` doc with that `sessionId` before creating a new one, and the whole write is wrapped in a Firestore transaction. **Alternative considered:** using `sessionId` directly as the `synthesisReports` document ID (making duplicate creation structurally impossible via `create()`-only semantics) — **this is the preferred mechanism, adopted over the query-then-transaction approach**, because a `create()`-only write fails fast and atomically on a duplicate without needing a transaction at all. Documented here as the actual decision: **`synthesisReports` document ID = `sessionId`.**

## 4. `quotes/{quoteId}`

**Purpose:** Denormalized, dashboard-optimized store of notable verbatim respondent quotes (PRD FR-24 "AI Insights", Document 4 §2), so the Admin Panel never scans `messages` subcollections across all sessions to find quotable material.

| Field | Type | Notes |
|---|---|---|
| `templateId`, `sessionId`, `messageId` | string (ref) | Traceable back to source |
| `text` | string | The quote itself |
| `context` | string | One-line "what was being discussed" |
| `painPoint` | string, nullable | |
| `createdAt` | timestamp | |

## 5. `opportunities/{opportunityId}`

**Purpose:** Cross-session aggregated startup opportunities (PRD FR-21/24), one document per distinct opportunity theme per template, incrementally updated as new sessions surface supporting evidence — not recreated from scratch (Document 4 §4 aggregation strategy).

| Field | Type | Notes |
|---|---|---|
| `templateId` | string (ref) | |
| `title`, `description` | string | |
| `supportingSessionIds` | array of string | Bounded by practical opportunity count per template, not by respondent count — safe as an array |
| `mentionCount` | number | Incremented, not recomputed |
| `avgConfidence` | number | Running average, updated incrementally |

## 6. `analyticsRollups/{templateId}_{yyyy-mm-dd}`

**Purpose:** The sole read path for the Admin Dashboard (Document 4 §4). Deterministic composite ID (`templateId_date`) so the update trigger can write with a simple `set({...}, {merge: true})` — no query needed to find "today's rollup for this template."

| Field | Type | Notes |
|---|---|---|
| `templateId`, `date` | string | |
| `interviewsStarted`, `interviewsCompleted`, `interviewsAbandoned` | number | |
| `totalDurationSeconds` | number | Divided by count client-side or in `AnalyticsService` for the average — **not stored pre-averaged**, so re-aggregation (e.g., weekly rollups) can recompute correctly (a stored average cannot be re-averaged without the underlying count, which is why the raw sum is the source of truth) |
| `avgPainScore`, `avgWillingnessToPay` | number | Computed at read time from sums + counts, per above |
| `topCountries`, `topOccupations`, `topPainPoints`, `topCompanies`, `topCompetitors` | map<string, number> (bounded top-N, e.g., top 20) | Incrementally maintained; **Assumption:** top-20 is sufficient dashboard granularity — logged as a new register entry below |
| `estimatedCostUsd` | number | Sum of session-level `estimatedCostUsd` for this template/day — feeds the spend-cap check |

## 7. `aiProviderConfigs/{provider}`

**Purpose:** Global, non-template-specific provider settings (API key reference — see Document 6 for how the actual secret is stored, this doc holds only non-secret metadata; rate limits; per-provider cost-per-token table for cost estimation).

| Field | Type | Notes |
|---|---|---|
| `provider` | enum | Document ID = provider name |
| `enabled` | boolean | Kill switch without redeploying (PRD FR-30 spirit) |
| `costPerInputTokenUsd`, `costPerOutputTokenUsd` | number | Used to compute `estimatedCostUsd` at the provider layer (Architecture §4) |
| `defaultModel` | string | e.g. `gpt-4o-mini` — model tier is config, reinforcing "switch via config only" |

## 8. `configurations/{configId}`

**Purpose:** Singleton-ish global settings not specific to any one template (Architecture §7). In practice a small, fixed set of known document IDs (e.g., `configurations/global`) rather than an open collection.

| Field | Type | Notes |
|---|---|---|
| `globalDailySpendCapUsd` | number | A ceiling across *all* templates combined — a second layer of protection beyond per-template caps |
| `defaultAiProvider` | string | Fallback when a template doesn't override |
| `featureFlags` | map<string, boolean> | e.g. `streamingEnabled`, `synthesisEnabled` |

## 9. `auditLogs/{logId}`

**Purpose:** Cross-cutting log of every LLM call (cost, latency, outcome — PRD NFR-Observability) and every admin action (template published, session exported), required for the spend-cap mechanism to be verifiable after the fact, not just trusted blindly.

| Field | Type | Notes |
|---|---|---|
| `type` | enum: `llm_call`, `admin_action`, `abuse_flag` | |
| `actorUid` | string, nullable | Null for system-triggered events |
| `templateId`, `sessionId` | string, nullable | Context refs |
| `details` | map | Type-specific payload (e.g., for `llm_call`: provider, tokens, cost, latencyMs, success) |
| `createdAt` | timestamp | |

**Alternative considered:** Writing audit data only to Cloud Functions logs (Cloud Logging), not Firestore. **Rejected** because Cloud Logging is not queryable from the Angular Admin Panel via client SDK and has retention/cost tradeoffs of its own; a Firestore audit collection is directly queryable for the "why did we hit the spend cap" investigative flow the operator needs, and this is a low-write-volume collection (one write per LLM call/admin action, not per respondent keystroke) so the cost concern that drove other design choices doesn't apply here.

## 9A. Amendment (ADR-0012) — Cross-Device Session Resume

The founder requires a respondent be able to resume an in-progress interview from a different device/browser via a saved or shared link, not just the originating one. This changes two things from §2 above:

- **`sessions/{sessionId}.respondentUid` is no longer immutable for the life of the session.** It is set at creation as before, but `resumeSession` (Document 9/10 amendments) may re-bind it to a new anonymous UID when a valid resume token is presented from a different device. Added fields: `resumeTokenExpiresAt` (timestamp) — denormalized onto the session purely for display in the Admin session detail view (Document 8 §8); the authoritative expiry check happens against the lookup collection below, not this copy.
- **New collection: `sessionResumeTokens/{token}`** — a dedicated lookup, keyed by the token itself (a high-entropy random string, generated server-side, never derived from `sessionId`) so a resume attempt is an O(1) document `get`, never a query/scan.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string (ref) | |
| `createdAt` | timestamp | |
| `expiresAt` | timestamp | Default: `createdAt + 7 days` (Document 5 §8's `configurations` gains a `resumeTokenTtlDays` field to make this tunable without redeploying) |
| `lastUsedAt` | timestamp, nullable | Updated on each successful resume — lets the operator distinguish a token that's never been used from one resumed repeatedly |

**Why a separate lookup collection instead of storing the token directly on the session document:** decouples the resume *capability* (the token) from the session's own identity (`sessionId`). This means the token can be rotated or revoked (e.g., delete the lookup doc) without touching the session record itself, and a leaked `sessionId` (visible to the operator in the Admin Panel, logs, etc.) never doubles as a usable resume credential.

**Firestore Rules implication:** `sessionResumeTokens` is system-only — no client read or write, in either direction (not even the respondent's own) — consistent with Document 6 §2's principle that anything with real access-control consequence is never exposed to rules-based client logic. *(Full rules table amendment in Document 6.)*

## 10. Required Composite Indexes

| Collection | Fields | Purpose |
|---|---|---|
| `sessions` | `templateId` ASC, `startedAt` DESC | Admin session list per template, newest first |
| `sessions` | `status` ASC, `templateId` ASC | Filtering active/completed/abandoned per template |
| `analyticsRollups` | `templateId` ASC, `date` DESC | Dashboard date-range queries |
| `auditLogs` | `templateId` ASC, `createdAt` DESC | Spend-cap investigation queries |
| `quotes` | `templateId` ASC, `createdAt` DESC | Recent quotes per template |

## 11. New Assumptions Introduced by This Document

| # | Assumption | Rationale | Impact if False |
|---|---|---|---|
| A7 | Top-20 bounded maps (countries, occupations, pain points, etc.) are sufficient granularity for dashboard rollups. | Matches typical long-tail distribution of these categories; showing beyond top-20 in a dashboard chart has diminishing UX value regardless of data completeness. | If deep long-tail analysis is needed later, the raw `sessions`/`messages` collections remain queryable as a fallback — this is a dashboard-convenience bound, not a data-loss risk. |
| A8 | `synthesisReports` document ID = `sessionId` is an acceptable one-to-one constraint (a session can never need more than one synthesis report). | Matches PRD FR-22 exactly ("synthesis runs once per completed session"). | If a future requirement needs re-synthesis with different parameters (e.g., re-running with an improved prompt), this becomes a versioned subcollection under the report, same pattern as templates §1.1 — not a breaking change, an additive one. |

*(These are also being added to [00-assumptions-register.md](./00-assumptions-register.md).)*

---

**Approval needed:** Confirm this schema before Document 6 (Security Model) writes Firestore Security Rules against these exact collections and fields.
