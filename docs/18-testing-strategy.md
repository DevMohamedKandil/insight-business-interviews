# InsightAI — Testing Strategy

**Document 18 of 20**
**Depends on:** [07-folder-structure.md](./07-folder-structure.md), [10-cloud-functions-design.md](./10-cloud-functions-design.md), [06-security-model.md](./06-security-model.md)
**Status:** Draft for approval

---

## 1. Guiding Principle: Tests Must Never Call Real AI Providers or Cost Real Money

This is the one testing-strategy decision that follows directly from this product's specific risk profile (Document 15 R1) rather than generic best practice: **a CI pipeline that accidentally calls a real LLM API on every push is a direct violation of the cost-control principle that shapes this entire project.** Every test level below is designed so that is structurally impossible, not just discouraged by convention.

## 2. Test Pyramid

```
        ┌─────────────────────┐
        │   E2E (few)          │  Playwright — real emulator suite, real UI, mocked AI provider HTTP layer
        ├─────────────────────┤
        │ Integration (some)   │  Functions Emulator — real Firestore emulator, real function code, mocked AI provider
        ├─────────────────────┤
        │  Unit (many)         │  Services/Repositories/Providers in isolation, everything external mocked
        └─────────────────────┘
```

## 3. Unit Testing (Backend — `apps/functions/test/`)

Mirrors `src/` structure per Document 7 §6.

- **Service Layer tests** (`interview.service.spec.ts` etc.): repositories and `IAIProvider` are injected as hand-written test doubles (Architecture §3's constructor-injection design is exactly what makes this possible without a mocking framework doing anything clever) — e.g., a `FakeAIProvider` that returns scripted `InterviewTurnOutput` values, letting tests exercise coverage-goal termination logic (Architecture §5), spend-cap short-circuiting (Document 6 §4), and history-bounding (Document 10 §3) entirely deterministically, with zero network calls.
- **Provider Layer tests**: each `IAIProvider` implementation (`openai.provider.spec.ts` etc.) is tested against a **recorded fixture response** (a saved real API response shape, captured once manually during development, replayed in tests) rather than a live call — this catches "did we parse the vendor's structured-output format correctly" without needing network access or spending money on every test run.
- **Repository Layer tests**: run against the **Firestore Emulator** (not mocked) — repositories are thin enough that mocking Firestore itself would mostly test the mock, not the code; the emulator is free, fast, and gives real confidence that queries/writes match Document 5's schema.
- **Target coverage:** Service and Provider layers (where the actual business logic and cost/security-critical decisions live) at high statement coverage; Repository layer coverage is a natural byproduct of Service-layer tests exercising it, not pursued as an independent number for its own sake — chasing 100% coverage on thin data-access code is a documented example of the anti-pattern in Document 15's "over-mitigation" framing (Document 15 §2).

## 4. Firestore Security Rules Testing (Document 6 §2)

- Every row of Document 6 §2.1's rules table gets **both** an "allow" test and a "deny" test using `@firebase/rules-unit-testing` against the emulator — e.g., explicitly asserting a respondent's own anonymous UID *can* read their session, a *different* anonymous UID *cannot*, and no UID at all (unauthenticated) *cannot*.
- **The single most important test in this suite, called out explicitly:** an authenticated (even admin-less) client attempting a **direct client-side write** to `sessions` or `messages` must be denied — this is the concrete verification of Document 6 §2's central claim ("clients cannot write here, period"). If this test ever passes when it shouldn't (i.e., a rule change accidentally opens this up), it should be treated as a security regression, not a normal test failure.
- Rules tests run in CI on every push that touches `firestore.rules` (Document 19), not just before releases — this is cheap (emulator-only, no real cost) and catches regressions at the point they're introduced.

## 5. Integration Testing (Functions Emulator Suite)

- Full request → API Layer → Service Layer → Repository Layer (against Firestore Emulator) → **mocked `IAIProvider`** → response, run via the Firebase Emulator Suite (`firebase emulators:exec`).
- Covers the sequences documented in Cloud Functions Design (Document 10 §2, §4): the full `sendMessage` flow including spend-guard short-circuit, the `onMessageWrite` → `onSessionComplete` → `onSynthesisRequested` trigger chain (Document 10 §4), and idempotency (Document 5 §3 — explicitly test that re-triggering synthesis for an already-completed `sessionId` does not create a duplicate report, verifying the `create()`-only mechanism actually rejects the duplicate as designed).
- **AI provider mocking at this level:** a lightweight local HTTP server (or an in-process fake matching each vendor's response shape) stands in for OpenAI/Claude/Gemini during integration tests — this is a different mock than the unit-level `FakeAIProvider` because it exercises the real HTTP call path (timeouts, error handling, Document 10 §5's failure handling) rather than bypassing it entirely.

## 6. End-to-End Testing (Playwright, Angular App)

- **Public interview flow:** load `/i/{testSlug}` against the emulator suite, send scripted messages, assert streaming UI renders progressively (Document 8 §2), assert the closing state appears after a scripted "coverage goals satisfied" response from the mocked provider, assert the unavailable-template state renders correctly for a `paused` template (Document 8 §4).
- **Admin flow:** login, create a template, publish it (asserting the FR-3 validation blocks publish when `dailySpendCapUsd` is missing — testing the *server-side* validation, Document 9 §3.3, not just that the form field exists), view a session detail, trigger a CSV export.
- **Explicit non-goal:** E2E tests do not attempt to assert anything about actual AI-generated text quality or synthesis prose quality — that's a product/prompt-engineering evaluation activity (§7 below), not a pass/fail automated test, since LLM output is non-deterministic by nature.

## 7. Prompt/Quality Evaluation (Distinct From Automated Testing)

- Because the interview engine's core value is conversational and synthesis quality (not just "does the code run"), a lightweight **manual evaluation rubric** is maintained separately from the automated test suite: a small set of scripted respondent personas (e.g., "vague and reluctant," "chatty and off-topic," "one clear pain point") run against a **real** provider (in a controlled, developer-initiated, cost-aware manner — never in CI, per §1) whenever the system prompt or coverage-goal structure changes meaningfully.
- **Rationale for keeping this manual/separate rather than automating with an LLM-as-judge pipeline:** an LLM-judge evaluation pipeline is itself a nontrivial engineering investment and an ongoing cost; at MVP scale (Document 14), a human (the founder, who deeply understands what a good interview should surface) reviewing a handful of transcripts is more reliable and cheaper than building a judge pipeline whose own accuracy would need separate validation. **Revisit trigger:** if prompt-quality regressions start slipping through manual review at higher template/change volume, an automated LLM-judge pass becomes justified — logged here rather than built preemptively, consistent with Document 17 §1's overall philosophy.

## 8. Abuse/Security Testing (Ties to Document 15 R1-R2, Sprint S3.1)

- Automated tests assert the *mechanism* (spend-guard short-circuits before calling the provider, abuse heuristic flags known injection patterns) — covered at the unit/integration level above.
- **Manual adversarial testing** (Document 13 Sprint S3.1) is a distinct, human-driven activity: actually attempting realistic prompt injections and scripted rapid-fire session starts against a real (non-production or carefully bounded production) deployment, because automated tests can only verify defenses against *known* attack patterns already encoded into the heuristics — real adversarial creativity requires a human trying to break it.

## 9. What Runs Where (Summary)

| Test Level | Runs In CI (every push) | Uses Real AI Provider | Uses Firestore Emulator |
|---|---|---|---|
| Unit | Yes | No | Only Repository tests |
| Rules | Yes | N/A | Yes |
| Integration | Yes | No (mocked) | Yes |
| E2E | Yes (Document 19's pipeline) | No (mocked) | Yes |
| Prompt/Quality Evaluation | No — manual, developer-triggered | Yes, deliberately | N/A |
| Adversarial/Abuse | No — manual, Phase 3 sprint | Yes, deliberately | Real/bounded deployment |

---

**Approval needed:** Confirm this testing strategy before Document 19 (Deployment Strategy) wires these test levels into the actual CI/CD pipeline stages.
