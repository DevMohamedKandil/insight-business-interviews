# InsightAI — Cost Estimation (Firebase Blaze Plan)

**Document 16 of 20**
**Depends on:** [06-security-model.md](./06-security-model.md) §4, [15-technical-risks.md](./15-technical-risks.md) R1
**Status:** Draft for approval

---

## 1. Framing: "Near-Zero," Precisely Defined

Per Vision §13.1, this document does not claim a literal $0 ceiling — it quantifies exactly how close to $0 the architecture gets at realistic MVP volume (Assumption A3), and identifies the one line item (LLM tokens) that is genuinely usage-proportional rather than free-tier-bounded.

**Important caveat, stated plainly rather than glossed over:** all unit prices below (Firebase free-tier thresholds and LLM per-token pricing) are Google/OpenAI/Anthropic-set figures that change over time and were last verified against publicly available pricing as of this document's drafting. **This document's numbers are directional and must be re-verified against the live pricing pages before each funding/scaling decision that depends on them** — treating a cost estimate document as permanently accurate would be a worse mistake than the estimate being slightly stale. Logged as Assumption A12 below.

## 2. Firebase Platform Costs (Firestore, Functions, Hosting, Storage, Auth, App Check)

All of the following are **free at the daily/monthly quota level on the Blaze plan** — Blaze only changes the *billing model* (pay above the quota) from Spark's hard cutoff (Vision §13.1), it does not remove the free allowance itself.

| Service | Free Daily/Monthly Quota (approx.) | MVP-Scale Usage Estimate (10-100 interviews/day) | Headroom |
|---|---|---|---|
| Firestore reads | 50,000/day | ~15-25 reads/session (session doc, template, messages on load) × 100 sessions ≈ 2,000-2,500/day | Comfortable — roughly 20x under quota |
| Firestore writes | 20,000/day | ~10-14 writes/session (2 messages/turn × ~6 avg turns + session updates + audit log + rollup) × 100 sessions ≈ 1,000-1,400/day | Comfortable — roughly 15x under quota |
| Cloud Functions invocations | ~2,000,000/month | ~15-20 invocations/session (sendMessage per turn + triggers) × 100/day × 30 ≈ 45,000-60,000/month | Comfortable — well under 5% of quota |
| Cloud Functions compute (GB-seconds / CPU-seconds) | Generous monthly allotment | Streaming calls run longer than typical CRUD functions (Document 10 §1's 60s timeout on `sendMessage`), so this is the Functions line item to watch first if volume grows — not invocation count | Monitor, not currently a concern at MVP scale |
| Hosting storage + transfer | 10 GB stored / modest daily transfer allowance | Angular bundle is a few MB; public bundle specifically kept small via lazy-loaded admin (Document 11 §2) | Comfortable |
| Firebase Storage (exports) | 5 GB stored, bounded daily up/download | CSV/PDF exports are small, generated on-demand, not stored long-term at volume | Comfortable |
| Anonymous Auth | No meaningful cost driver | N/A | N/A |
| App Check (reCAPTCHA) | Free at this volume tier | N/A | N/A |

**Conclusion: at MVP scale, Firebase platform costs round to $0.00.** The entire "near-zero" claim from Vision §13.1 rests on Firestore/Functions usage staying in this range, which Document 4's aggregation strategy (bounded rollup reads, not full-collection scans) and Document 10's capped `maxInstances` (Document 10 §1) are specifically designed to preserve as volume grows, not just at today's low volume.

## 3. LLM Token Costs — The One Real Usage-Proportional Line Item

### 3.1 Per-Interview Token Estimate

Derived from Document 10 §3's bounded-history design and Document 5 §3's synthesis fields:

| Call Type | Occurrences per Session (avg ~9-turn interview, Document 5's `maxTurns` example) | Avg Input Tokens | Avg Output Tokens |
|---|---|---|---|
| Interview turn (reply + classification, one structured call) | 9 | ~1,500 (system prompt + bounded sliding-window history, growing then capped per Document 10 §3) | ~300 (reply text + classification JSON fields) |
| Synthesis (14 fields, one call, Document 14 §4) | 1 | ~4,000 (full transcript + rules) | ~1,500 (all fourteen fields) |
| **Session total** | — | **~17,500 input** | **~4,200 output** |

### 3.2 Cost at Representative Provider Pricing (Illustrative — see §1 caveat)

| Provider / Tier | Input $/1M tokens | Output $/1M tokens | Est. Cost per Session |
|---|---|---|---|
| OpenAI (small/mini tier, Document 12's Phase 1 default) | ~$0.15 | ~$0.60 | ~$0.0026 (input) + ~$0.0025 (output) ≈ **$0.005** |
| Gemini (flash tier) | ~$0.08 | ~$0.30 | ~$0.0014 + ~$0.0013 ≈ **$0.003** |
| Claude (haiku tier) | ~$0.80 | ~$4.00 | ~$0.014 + ~$0.017 ≈ **$0.031** |

**Reading this table correctly:** the ~6x spread between the cheapest and most expensive tier here is exactly why the AI Provider Layer (Architecture §4) treating provider choice as configuration matters in practice, not just architecturally — a template can be pointed at whichever provider best balances quality and cost for its specific use case, and that choice is reversible without engineering work.

### 3.3 Monthly Projection at Different Volumes

Using the OpenAI mini-tier estimate (~$0.005/session) as the MVP default:

| Interviews/day | Interviews/month | Est. Monthly LLM Cost |
|---|---|---|
| 10 | 300 | ~$1.50 |
| 100 | 3,000 | ~$15 |
| 1,000 | 30,000 | ~$150 |
| 10,000 | 300,000 | ~$1,500 |

**This table is the actual, honest answer to "how much will this cost":** at MVP and even early-growth volumes, total cost is a few dollars to low tens of dollars a month — genuinely near-zero in absolute terms. It only becomes a real budget line at the 1,000-10,000+ interviews/day range, which is itself a good problem (meaningful traction) and is exactly where per-template `dailySpendCapUsd` (Document 5 §1) and the global cap (Document 5 §8) exist to keep any single misconfigured or abused template from being the one that turns "good problem" into "surprise bill."

## 4. Recommended Default Spend Caps (Concrete Starting Values)

| Field | Recommended MVP Default | Rationale |
|---|---|---|
| `templates/{id}.dailySpendCapUsd` | $2.00 | At ~$0.005/session (OpenAI mini tier), covers ~400 sessions/day — far above realistic MVP single-template volume (Document 14 §5's "10 respondents" success criterion), while still bounding worst-case exposure to a trivial dollar amount |
| `configurations/global.globalDailySpendCapUsd` | $10.00 | Covers several templates simultaneously at the per-template default, still a trivial absolute exposure ceiling |

These are **starting values, tunable per template** (Document 8 §7's editor exposes this field directly) — not hardcoded constants, consistent with Vision §8.3's "config over code" principle.

## 5. New Assumption Introduced by This Document

| # | Assumption | Rationale | Impact if False |
|---|---|---|---|
| A12 | Firebase free-tier quotas and LLM per-token pricing quoted here remain directionally accurate; exact figures are re-verified against live pricing pages before major scaling/funding decisions. | Both Google's and AI providers' pricing pages change over time; a planning document is a point-in-time snapshot, not a live feed. | If pricing has shifted materially by the time this is acted on, the *relative* conclusions (which provider is cheaper, roughly how many sessions fit in a given cap) likely still hold even if absolute numbers drift — but should not be quoted to a third party (e.g., an investor) without re-verification. | [16](./16-cost-estimation.md) §1 |

*(Also appended to [00-assumptions-register.md](./00-assumptions-register.md).)*

---

**Approval needed:** Confirm these cost projections and default caps before Document 17 (Scaling Strategy) defines the volume thresholds at which this cost model's assumptions need re-examination.
