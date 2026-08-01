# InsightAI — Deployment Strategy

**Document 19 of 20**
**Depends on:** [18-testing-strategy.md](./18-testing-strategy.md), [06-security-model.md](./06-security-model.md) §8
**Status:** Design approved; execution intentionally deferred to Validation Sprint 2 ([Document 28](./28-validation-sprint-policy.md)). Nothing below changes — it simply isn't run yet.

---

## 1. Environment Topology

**Decision:** Two Firebase projects — `insightai-dev` and `insightai-prod` — plus Firebase Hosting **preview channels** for per-pull-request review, rather than a third full `staging` project.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Single project, no separation | Simplest possible setup | Every test/experiment risks real respondent data and real (if small) LLM spend; no safe place to test a destructive Firestore Rules change | Rejected — violates the "don't experiment against production" baseline regardless of team size |
| Three projects (dev / staging / prod) | Staging mirrors prod configuration exactly before every release | A third project means a third set of provider API keys/secrets to manage, a third place spend caps must be configured correctly, for a single-operator team (Assumption A1, A11) where the coordination benefit of a distinct staging environment (multiple people needing a shared pre-prod target) doesn't yet apply | Rejected for v1 — logged as the natural addition if/when a second engineer joins (same trigger as Document 17 S6's multi-tenancy signal, a team-size trigger, not a traffic trigger) |
| **Two projects + Hosting preview channels (chosen)** | Real isolation between "safe to break" (dev) and "real respondents" (prod); preview channels give every PR a real, shareable, disposable preview URL without a third whole project; matches actual team size | Dev project's Functions/Firestore behavior can drift slightly from prod if not deployed identically | **Chosen** — preview channels solve the "review before merge" need that staging usually solves, without the ongoing overhead of a third project's secrets/config to keep in sync |

## 2. What Lives in Each Project

| Concern | `insightai-dev` | `insightai-prod` |
|---|---|---|
| AI provider API keys (Document 6 §8) | Separate, low-limit keys (or a shared low-spend test key) — a leaked/misbehaving dev key must never be able to run up meaningful cost | Real production keys, Secret Manager only |
| `dailySpendCapUsd` defaults | Very low (e.g., $0.50) — dev is for correctness testing, not volume testing (Document 18 §7 covers where real quality evaluation happens, deliberately not "in dev at scale") | Per-template, operator-set (Document 16 §4's recommended defaults) |
| App Check | Enforced in **debug mode** for local/emulator development (Firebase's documented debug-token mechanism), enforced normally otherwise | Enforced, real reCAPTCHA (Document 6 §3) |
| Firestore data | Synthetic/test sessions only | Real respondent data |
| Admin claim | Founder's dev-testing account | Founder's real account (Document 6 §6) |

## 3. CI/CD Pipeline

```
On every push / PR:
  1. Lint (ESLint, both apps)
  2. Unit tests (Document 18 §3)
  3. Firestore Rules tests (Document 18 §4) — against Firestore Emulator
  4. Integration tests (Document 18 §5) — against Functions + Firestore Emulator
  5. Build (Angular production build + Functions TypeScript compile)
  6. E2E tests (Document 18 §6) — against Emulator Suite, mocked AI providers
  7. [PR only] Deploy Hosting preview channel (`insightai-dev` project) — reviewable URL posted to the PR
  8. [merge to main only] Deploy to insightai-dev fully (Hosting + Functions + Rules + Indexes)
  9. [manual trigger only] Promote insightai-dev artifact to insightai-prod
```

**Why step 9 is a manual trigger, not automatic on every merge to `main`:** given single-operator scope (Assumption A1), the founder is both the sole developer and the sole person accountable for a production incident — automatic continuous deployment to production removes a deliberate checkpoint that, at this team size, costs almost nothing to keep (one click) and catches "it passed CI but I want to sanity-check the preview first" cases that automated tests structurally cannot (per Document 18 §7's point about quality being partly a human-judgment activity). **Revisit trigger:** if release cadence becomes frequent enough that manual promotion is a genuine bottleneck, auto-deploy-to-prod on a tagged release (not every merge) is the natural next step — logged, not built preemptively.

## 4. Secrets in CI

- CI (GitHub Actions, assumed per common tooling — not load-bearing to any other document) uses a **service account with deploy-only permissions**, stored as a repository secret, scoped separately for `insightai-dev` vs. `insightai-prod` deploy targets — the prod deploy credential is never used by the automatic per-push pipeline steps (1-8 above), only by the manual promotion step (9), narrowing its blast radius if CI itself were ever compromised.
- AI provider API keys are **never** CI secrets — they live only in each Firebase project's Secret Manager (Document 6 §8) and are injected into Functions at deploy/runtime by Firebase's own secret-binding mechanism, not passed through the CI pipeline at all.

## 5. Firestore Rules & Indexes Deployment

- `firestore.rules` and `firestore.indexes.json` (Document 7 §2) deploy alongside Functions/Hosting as one atomic `firebase deploy` step per environment — **never manually edited in the Firebase Console for prod**, so the deployed rules are always exactly what's in source control and passed the Document 18 §4 test suite. Console edits to security rules are treated as an incident-response-only escape hatch (e.g., emergency lockdown), always followed by reconciling the change back into source control immediately after.

## 6. Rollback Strategy

| Component | Rollback Mechanism |
|---|---|
| Hosting | Firebase Hosting's built-in release history — instant rollback to any previous release via `firebase hosting:rollback` or the Console, no rebuild needed |
| Functions | Redeploy the previous Git tag/commit's build — Cloud Functions doesn't have Hosting's one-click rollback, so **tagging every prod deployment** (`v1.2.0` etc.) is required specifically so "redeploy the last known-good tag" is always a known, fast command, not a git-log archaeology exercise under pressure |
| Firestore Rules | Same tag-based redeploy — rules are versioned in source control (§5), so rollback is redeploying the prior tag's `firestore.rules` |
| Firestore Data | **No automated rollback** — this is intentionally out of scope for v1 (no automated backup/restore pipeline yet); logged explicitly as a Document 20 Production Checklist item to decide on (manual export cadence at minimum) rather than silently assumed to be handled |

## 7. Feature Flags (Document 5 §8's `configurations.featureFlags`)

- Used for exactly the kind of change that's risky to deploy-and-immediately-affect-all-respondents: e.g., `streamingEnabled` can be flipped off (falling back to a non-streamed response, if that fallback path exists) without a redeploy if the streaming implementation misbehaves in production in a way tests didn't catch — a config change (instant) instead of an emergency rollback (slower).
- **Explicit non-goal:** this is not a full feature-flag/experimentation platform (no percentage rollouts, no A/B testing infrastructure) — just simple boolean kill switches for the handful of genuinely risky code paths, consistent with this document's general bias against building infrastructure beyond the specific problem it solves.

---

**Approval needed:** Confirm this deployment strategy before Document 20 (Production Checklist), which is the final gate combining every prior document's launch-blocking requirements.
