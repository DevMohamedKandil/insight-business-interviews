# InsightAI — Cloud Functions Design

**Document 10 of 20**
**Depends on:** [09-api-design.md](./09-api-design.md), [03-software-architecture.md](./03-software-architecture.md)
**Status:** Draft for approval

---

## 1. Function Inventory & Runtime Configuration

| Function | Type | Memory | Timeout | Min Instances | Max Instances |
|---|---|---|---|---|---|
| `startSession` | Callable | 256 MiB | 30s | 0 | 10 |
| `sendMessage` | HTTPS (streamed) | 512 MiB | 60s | **0** | 10 |
| `createTemplate` / `updateTemplateDraft` / `publishTemplate` | Callable | 256 MiB | 30s | 0 | 5 |
| `exportSessions` | Callable | 512 MiB | 120s | 0 | 3 |
| `onMessageWrite` (trigger) | Firestore trigger | 256 MiB | 30s | 0 | 10 |
| `onSessionComplete` (trigger) | Firestore trigger | 256 MiB | 30s | 0 | 5 |
| `onSynthesisRequested` (trigger) | Firestore/Pub-Sub-style trigger | 512 MiB | 300s | 0 | 3 |

**Why `minInstances: 0` everywhere, including the latency-sensitive `sendMessage`:** `minInstances > 0` keeps a warm instance permanently billed, which directly contradicts the free-tier-first constraint (Vision §13.1) for a v1 with low, unpredictable traffic (Assumption A3). **Alternative considered:** `minInstances: 1` on `sendMessage` specifically, trading a small standing cost for eliminating cold-start latency on the most user-facing function. **Rejected for v1, revisit criterion documented:** cold start on Node.js Cloud Functions Gen 2 is typically ~1-2s, which is within the "thinking delay" the UI already displays intentionally (Document 8 §2) — the cold start is largely absorbed by UX pacing that exists anyway. If real usage data (Document 16/17) shows this assumption wrong (cold starts becoming visible/annoying at actual traffic patterns), `minInstances: 1` on `sendMessage` alone is the specific, narrow fix — not a blanket policy change.

**Why max instances are capped low (3-10) rather than left at platform defaults:** an uncapped `maxInstances` on a function that calls a paid external API is, in effect, an uncapped concurrent-spend ceiling — a second, independent layer of cost protection alongside the spend-cap logic in Document 6 §4 (defense in depth: if the spend-cap check itself has a bug, a hard instance ceiling still bounds the blast radius).

## 2. `sendMessage` — Detailed Internal Flow

This is the most complex function; the others are comparatively straightforward CRUD-with-validation. Full sequence (elaborating Document 9 §2.2's server-side sequence with internal implementation detail):

```
1.  Verify Firebase ID token (anonymous) + App Check token
2.  Load session doc (SessionRepository.get)
      → 404 if not found or respondentUid mismatch
      → 409 if status != 'active'
3.  SpendGuardService.checkBudget(session, template)
      → if exceeded: write session.status = 'abandoned', abandonReason = 'spend_cap'
        stream {type:'done', sessionStatus:'abandoned', closingMessage} and RETURN
        (no AI call made — this ordering is the entire point of the check)
4.  AbuseDetectionService.scan(text)
      → heuristic pattern match (Document 6 §5.3), does NOT block, sets a flag
        passed downstream to step 6's audit log entry
5.  InterviewService.buildTurnContext(session, template, newMessage)
      → loads bounded message history (last N turns, per Architecture §6's
        max-token conversation budget — NOT the full unbounded history if
        maxTurns is large; see §3 below for the exact bounding rule)
      → constructs system prompt: base prompt + conversation rules +
        remaining (unsatisfied) coverage goals + language instruction +
        anti-injection instructions (Document 6 §5.1)
6.  AIProviderFactory.resolve(template.aiProvider) → concrete IAIProvider
7.  provider.generateInterviewTurnStreaming(context)
      → yields tokens as they arrive; each yielded to the HTTPS response
        as a {type:'token', value} chunk (Document 9 §2.2's wire format)
      → on stream completion, returns full { replyText, extraction, usage }
8.  Persist (in a single batched write):
      - messages/{respondentMessageId}: masked text (Document 6 §7) + classification
      - messages/{assistantMessageId}: replyText
      - session: turnCount++, estimatedCostUsd += usage.costEstimateUsd,
        coverageGoalsSatisfied updated from extraction signals,
        topPainPoint/topUrgency/etc. denormalized fields refreshed (Document 4 §5)
      - auditLogs/{logId}: type='llm_call', provider, tokens, cost, latencyMs,
        abuseFlag from step 4
9.  Evaluate termination (Architecture §5): all coverage goals satisfied,
      OR turnCount >= maxTurns, OR explicit respondent disengage signal
      → if terminating: session.status = 'completed', endedAt = now
        (this write is what onSessionComplete's trigger fires on)
10. Stream final {type:'done', turnCount, coverageGoalsSatisfied, sessionStatus,
      closingMessage?} and end the HTTP response
```

**Why steps 3-4 run before step 5 (context building) and step 6 (the actual paid call):** every check that can reject a turn *without* spending money must run before any code path that spends money. This ordering is itself a security/cost control, not an implementation detail — a future refactor that reorders these must be treated as a regression.

## 3. History Bounding Rule (Concrete Rather Than Hand-Wavy)

Architecture §5/§6 established that conversation history must be bounded; this document commits to the specific rule: **the last 12 conversation turns (24 messages) are sent as explicit history; anything older is summarized into a single rolling "context so far" string, regenerated by the model itself as part of its structured output once the window is exceeded.**

**Alternatives considered:**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Send full unbounded history every turn | Simplest, zero information loss | Token cost per turn grows linearly with turn count — directly at odds with `maxTokensPerTurn`/spend-cap goals | Rejected |
| Hard-truncate to last N turns, drop everything older | Simple, bounded cost | Loses early-interview context that may matter (e.g., an early detail the model should still reference) | Rejected as sole strategy |
| **Sliding window + rolling AI-generated summary (chosen)** | Bounded cost, no hard information loss (summary preserves salient points) | Slightly more complex; summary quality depends on the model | **Chosen** — `maxTurns` (Document 5 §1, typically ≤14-20 per PRD) means most interviews never actually exceed the 12-turn window in practice; this mechanism mainly exists as a ceiling for templates configured with a higher `maxTurns`, not a mechanism exercised on every interview |

## 4. Trigger Chain: `onMessageWrite` → `onSessionComplete` → `onSynthesisRequested`

```
messages/{id} written  ──▶  onMessageWrite
                              (increments analyticsRollups counters,
                               Document 4 §4 — cheap, always runs)

session.status → 'completed'  ──▶  onSessionComplete
                              (writes synthesisReports/{sessionId} with
                               status:'pending' via create()-only —
                               Document 5 §3's idempotency mechanism —
                               then invokes onSynthesisRequested)

                                    onSynthesisRequested
                              (the actual long-running LLM synthesis call,
                               PRD FR-21; separated into its own function
                               with a 300s timeout and 512 MiB memory —
                               see rationale below)
```

**Why synthesis is a separate function from `onSessionComplete` rather than inline:** `onSessionComplete` also needs to run fast and reliably for the rollup-adjacent bookkeeping (marking completion counters); bundling a potentially slow, retry-prone LLM synthesis call into the same function risks that bookkeeping being delayed or retried unnecessarily if only the synthesis part fails. Splitting them means a synthesis failure retries in isolation (§5) without re-running completion bookkeeping that already succeeded.

## 5. Retry & Failure Handling

- **`onSynthesisRequested` failures** (PRD FR-23: "never silently stuck"): Cloud Functions' built-in retry-on-failure (configured via `retry: true` for background functions) handles transient errors (provider timeout, temporary Firestore contention) up to a bounded attempt count tracked in `synthesisReports.generationAttempts`. After 3 attempts, `status` is set to `failed` (not left as `pending` forever) and an `auditLogs` entry is written so the operator can see it in the Admin Panel rather than the session silently never getting a report.
- **`sendMessage` mid-stream provider failures:** the function does not retry internally (the respondent is actively waiting; a silent multi-second internal retry would look like a hang). Instead it ends the stream with an error chunk (Document 9 §2.2's 500 case) and leaves `session.status` as `active` — the respondent's next message attempt is the retry, which is the correct UX (matches Document 8's "connection lost, one moment" inline affordance) rather than an invisible backend retry loop.

## 5A. `resumeSession` — Internal Flow (Amendment, ADR-0012)

```
1.  Verify Firebase ID token (anonymous, freshly issued on this device) + App Check
2.  RateLimiter.check(callerUid/ipHash) — same limiter instance/config as startSession
3.  Look up sessionResumeTokens/{token} (single doc get, Document 5 §9A)
      → NOT_FOUND if missing
4.  If token.expiresAt < now → treat identically to NOT_FOUND (Document 9 §2.3's
      deliberate error-message uniformity)
5.  SessionRepository.update(token.sessionId, { respondentUid: caller.uid })
      → this is the one place outside startSession that writes respondentUid,
        and it only ever happens via this privileged, audited path
6.  Update sessionResumeTokens/{token}.lastUsedAt = now
7.  Fetch session + its messages subcollection (bounded by the same history
      window as §3 above — a very long-abandoned-then-resumed interview does
      not replay unbounded history to the client either)
8.  Return { sessionId, templateSlug, language, status, messages }
```

Token generation (at `startSession` time, alongside the existing session-creation write): `crypto.randomBytes(24).toString('base64url')` — 192 bits of entropy, matching Document 6 §8A's threat mitigation for T7. Written to `sessionResumeTokens/{token}` with `expiresAt = now + configurations/global.resumeTokenTtlDays` (default 7, Document 5 §9A).

## 6. Composition Root (Architecture §3, Concrete Form)

```typescript
// composition-root.ts
const firestore = getFirestore();
const secretRegistry = { openaiKey: openaiApiKeySecret.value(), ... };

const templateRepo = new TemplateRepository(firestore);
const sessionRepo = new SessionRepository(firestore);
const messageRepo = new MessageRepository(firestore);
const auditLogRepo = new AuditLogRepository(firestore);

const providerFactory = new AIProviderFactory({
  openai: new OpenAIProvider(secretRegistry.openaiKey),
  claude: new ClaudeProvider(secretRegistry.claudeKey),
  gemini: new GeminiProvider(secretRegistry.geminiKey),
});

const spendGuard = new SpendGuardService(sessionRepo, templateRepo, analyticsRollupRepo, configRepo);
const abuseDetection = new AbuseDetectionService();
const interviewService = new InterviewService(
  templateRepo, sessionRepo, messageRepo, providerFactory, spendGuard, abuseDetection, auditLogRepo
);

export { interviewService, templateService, analyticsService, synthesisService };
```

This module is imported once per function's cold start (Cloud Functions Gen 2 keeps the module scope warm across invocations on the same instance) — repositories and providers are constructed once per instance, not per request, which is both a performance optimization and the reason secrets are read once (via `defineSecret().value()`) rather than fetched per-request.

---

**Approval needed:** Confirm this design before Document 11 (Angular Architecture) specifies how the frontend consumes `sendMessage`'s streamed contract.
