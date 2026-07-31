# InsightAI — Interview Orchestrator (Deterministic Policy Enforcement)

**Document 26 of the series**
**Status:** Design only — no code written yet. Awaiting approval before implementation, per the agreed sequencing.
**Triggered by:** Document 25 §8's real A/B test — `gpt-4o-mini` did not reliably follow two explicit, simple hard rules (one question per turn; no forced summarizing preamble) at a meaningfully different rate before vs. after a much more detailed prompt. The prompt wasn't the bottleneck; the model's instruction-following consistency was.

---

## 1. Core Design Principle

**Stop trusting the model to self-report whether it followed the rules. Check, in code, whether it actually did — and only ask the model to self-correct once there's a measured reason to believe it needs to.**

This does not touch the five-layer architecture (Research Objectives, Conversation Objectives, Interview Policy, Evidence Levels, Evidence Contract). The Orchestrator is a new, thin layer that sits *around* Layer 4 (Interview Policy) — it observes what the model actually produced and feeds that observation back in, rather than changing what any layer means.

## 2. Where It Sits

```
InterviewService.processTurn()
  → provider.generateInterviewTurnStreaming(...)   [unchanged — ADR-0013 streaming untouched]
  → output.replyText now fully available
  → NEW: InterviewOrchestrator.detectViolations(output.replyText, currentEvidenceMap)
  → NEW: persist violations to auditLogs (measurement) and session.lastTurnPolicyViolations (feedback)
  → (existing) persist messages, update session, evaluate termination
```

**Critically, this runs *after* streaming completes**, using the same full `replyText` the client already received token-by-token. Nothing about the respondent-facing streaming experience changes — this is why the earlier design tradeoff (streaming vs. validate-before-showing) resolves cleanly in favor of keeping streaming: we measure after the fact and correct going *forward*, not by blocking or rewriting what the respondent already saw.

## 3. The Four Deterministic Checks

All pure string/heuristic logic — no LLM call, negligible latency, zero added cost. Same epistemic posture as `AbuseDetectionService` (Document 6 §5.3): a heuristic, not a guarantee, logged as such.

| Check | Tag | Logic |
|---|---|---|
| Multiple questions in one reply | `multiple_questions` | Count `?`/`؟` occurrences in `replyText`; more than one → violation |
| Opens with a summarizing preamble | `opens_with_summary` | `replyText` (trimmed) starts with a phrase from a bilingual list: AR — "يبدو أن", "من الواضح أن", "من الجيد أن", "أفهم أن", "فهمت،"; EN — "it seems", "it's clear", "i understand", "i see that", "it sounds like" |
| Solution/tool talk raised too early | `premature_solution_talk` | `replyText` contains a solution-keyword (AR: "تطبيق", "أداة", "خدمة تساعد", "منصة تساعد"; EN: "app", "tool", "platform that", "service that could help") **while** at least one still-relevant Conversation Objective is below `strong` in the current evidence map |
| Two emotional questions in a row | `consecutive_emotional_question` | `replyText` matches an emotion-probe list (AR: "شعرت", "تشعر", "شعورك"; EN: "how did that feel", "how does that make you feel") **and** the previous turn's stored violations already included this same tag |

## 4. Two Rollout Phases (Deliberately Separated)

### Phase A — Measure Only (ships first, zero behavioral risk)
- Every turn's violations are computed and logged to `auditLogs` (`details.policyViolations: string[]`) alongside the existing cost/latency/token fields.
- Nothing about the conversation changes. This phase exists purely to turn "we think the model still does this" into "here's the actual violation rate over N real sessions" — the number the founder explicitly asked for.
- **This phase alone answers the open question from Document 25 §8**: is the violation rate roughly stable, going up, or going down as more real sessions accumulate? That answer should exist before deciding whether a stronger model is even necessary.

### Phase B — Measure + Correct Next Turn (only after Phase A data justifies it)
- If the current turn's violations are non-empty, store them on `session.lastTurnPolicyViolations` (denormalized, overwritten each turn — same pattern as `topPainPoint`/`topUrgency`, Document 4 §5).
- The **next** turn's prompt construction (`buildMessages`) appends one short corrective line only if this field is non-empty, mapped from tag to plain instruction, e.g.:
  `"REMINDER: your previous reply asked more than one question. This turn, ask exactly one."`
- This is a turn-delayed self-correction loop, not a same-turn retry — it costs nothing extra (no additional LLM call) and never touches what the respondent already saw.

### Explicitly Not Proposed Here — a Same-Turn Retry/Regenerate Mode
Would require buffering the full reply before streaming it (sacrificing the real-time feel) and would double cost/latency on any violated turn. Not designed here because it wasn't part of the agreed sequencing — named only so it's on record as a deliberately deferred option if Phases A/B prove insufficient.

## 5. Data Model Additions (Additive Only, No Restructuring)

- `Session.lastTurnPolicyViolations: string[]` — new field, empty array by default, overwritten each turn.
- `auditLogs` entries of `type: 'llm_call'` gain one new key inside the existing `details` map: `policyViolations: string[]`. No new collection, no schema restructuring — consistent with "do not change the architecture."

## 6. How the Founder Would See This

Reuses the existing audit-log-querying pattern (no new UI required for Phase A) — a script identical in shape to `check-audit-logs.ts` can aggregate `policyViolations` counts across a template's sessions to produce exactly the kind of number Document 21's validation protocol calls for (e.g., "`multiple_questions` occurred in 23% of turns this week"). A dashboard view is explicitly out of scope here — Document 14's MVP scoping already deferred the full Admin Dashboard, and this doesn't need to reopen that.

## 7. What This Does Not Do

- Does not change the JSON schema the interview model returns (Document 23/24's `objectiveEvidence`, `hypothesisEvidence`, etc. are untouched).
- Does not add a new AI call, and does not change cost per turn in Phase A or B.
- Does not retry or regenerate any respondent-facing content.
- Does not replace the model's own `selfReportedInjectionAttempt`/`respondentIndicatedNoMoreToAdd` self-reports — this is a second, independent, code-level check layered on top, same relationship `AbuseDetectionService` already has with the model's own self-reporting (Document 6 §5).

## 8. Open Questions Before Implementation

1. Confirm Phase A ships alone first (pure measurement), with Phase B implemented but left toggleable — or should both ship together?
2. Confirm the keyword lists in §3 are acceptable as a first pass — they will under- and over-fire in some cases (a heuristic, not a guarantee), same accepted limitation as Document 6 §5.3 and Assumption A9.

---

**Awaiting approval to implement, per the agreed sequencing: document → design → implement → only escalate to a different model if violations persist after this ships.**
