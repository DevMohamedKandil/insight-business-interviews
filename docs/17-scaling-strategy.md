# InsightAI — Scaling Strategy

**Document 17 of 20**
**Depends on:** [03-software-architecture.md](./03-software-architecture.md) §9, [04-database-design.md](./04-database-design.md), [16-cost-estimation.md](./16-cost-estimation.md)
**Status:** Draft for approval

---

## 1. Philosophy: Trigger-Based Scaling, Not Preemptive Scaling

Every architectural document in this series has deferred a specific optimization with an explicit "revisit when X happens" note, rather than building it speculatively. This document is where all of those triggers are collected in one place, so scaling this system is a checklist lookup, not a from-scratch redesign exercise when growth actually happens. The underlying belief, stated once here rather than repeated everywhere: **premature scaling investment is a real cost (engineering time, complexity, bugs) paid against a benefit (headroom) that may never be needed** — Vision §8.4 asked for modularity that *enables* scale, not infrastructure that *pre-builds* it.

## 2. Consolidated Trigger Table

| # | Trigger (Measured Signal) | Escalation Action | Originating Deferral |
|---|---|---|---|
| S1 | A single `analyticsRollups/{templateId}_{date}` document approaches Firestore's sustained per-document write-rate guidance (sustained high writes/second on one template on one day) | Shard the rollup document (`..._{date}_{shard}` with a hash of `sessionId`, aggregated by a scheduled function into a read-optimized summary) — Document 4/5's schema already isolates this concern to one collection, so sharding doesn't touch `sessions`/`messages` at all | Document 4 §4, R4 (Document 15) |
| S2 | `sendMessage` cold-start latency (Document 10 §1) is measured (not assumed) to be user-visibly hurting completion rate | Set `minInstances: 1` specifically on `sendMessage` — narrow, single-function change | Document 10 §1, R12 (Document 15) |
| S3 | A single template's daily interview volume regularly approaches its `dailySpendCapUsd` limit under legitimate (non-abuse) traffic | Not primarily a scaling action — it's a signal for the operator to *raise* that template's cap deliberately (Document 8 §7's editor), which is a config change, not an engineering task | Document 16 §4 |
| S4 | Aggregate LLM spend approaches the range where provider-tier economics matter (Document 16 §3.3's 1,000-10,000+ interviews/day range) | Revisit provider/model-tier selection per template using real classification-quality-vs-cost data gathered during Phase 2-3, rather than the illustrative estimates in Document 16 | Document 16 §3.2 |
| S5 | Cloud Functions GB-seconds/CPU-seconds (the Functions cost line flagged to "watch first" in Document 16 §2) approach their free allotment | Profile `sendMessage`'s actual execution time; consider whether the 60s timeout (Document 10 §1) is generously oversized relative to real streaming completion time and can be tightened | Document 16 §2 |
| S6 | A second organization/customer wants to run their own templates (the multi-tenancy trigger) | Scoped migration: add `orgId` to `templates` (and derive it onto `sessions` at creation, same denormalization pattern as `templateName` in Document 4 §5), scope Firestore Rules by `orgId`, move admin auth from a single hardcoded claim to per-org role assignment | Document 12 §6, Assumption A1 |
| S7 | Respondent geography meaningfully broadens beyond the initial region (Assumption A6) and latency complaints emerge | Evaluate Firestore multi-region configuration and/or a second Cloud Functions region with request routing — deliberately not designed now because it's non-trivial (data locality, cross-region consistency) and premature without a measured need | Document 3 §9, Assumption A6 |
| S8 | Synthesis workload (Document 10 §4's `onSynthesisRequested`) volume grows enough that Firestore-trigger-based invocation becomes an ordering/backpressure concern | Introduce Pub/Sub as an explicit queue between session completion and synthesis processing, giving control over concurrency/backpressure that direct triggers don't provide | Document 3 §9 |
| S9 | Template config reads (`TemplateRepository.get`, hit on every `sendMessage` call) show up as a meaningful proportion of Firestore read volume | Add an in-memory-per-instance cache with short TTL (already partially true per Document 3 §7's "read once per cold start" note) or, if instance churn makes that insufficient, a dedicated cache (Memorystore) — deliberately deferred past in-memory caching because a managed cache is a new billed service, not justified until in-memory proves insufficient | Document 3 §9 |

## 3. What Scaling Does NOT Require (Reassurance, Backed by Design)

Explicitly calling out what this architecture does *not* need to change even at significant growth, because these were designed for scale from the start rather than deferred:

- **No database migration.** Firestore's document-per-entity model with subcollections (Document 4-5) was chosen and shaped specifically to avoid the "worked fine with 100 rows, falls over at 100,000" trap — the aggregation strategy (bounded rollup reads) means dashboard performance is decoupled from total historical data volume by design, not by luck.
- **No AI provider re-architecture.** Adding capacity, switching models, or adding a fourth/fifth provider (DeepSeek, Grok, Mistral, local LLM per Vision's future-providers list) is contained entirely within the provider layer (Architecture §4) regardless of scale.
- **No frontend framework change.** Standalone components + Signals (Document 11) scale in engineering-team terms (more features, more contributors) independent of respondent-traffic scale, which is a different axis of "scale" than this document's focus but worth naming so it isn't conflated.

## 4. Explicit Non-Trigger: Volume Alone Never Justifies Microservices

Per Architecture §8's ADR #1, splitting the layered-monolith Functions codebase into separate deployed services is **not** on this trigger table, because no realistic v1-to-growth volume for this product creates the actual problem microservices solve (independent scaling of genuinely different load profiles, independent team ownership boundaries). If InsightAI someday has multiple engineering teams each owning a distinct domain (e.g., a dedicated synthesis/ML team vs. a product team), *that* — an organizational signal, not a traffic signal — would be the actual trigger, and is out of scope to plan for now.

---

**Approval needed:** Confirm this scaling strategy before Document 18 (Testing Strategy) defines how each layer above is verified before and after these triggers fire.
