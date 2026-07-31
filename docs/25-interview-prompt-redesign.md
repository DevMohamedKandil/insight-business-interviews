# InsightAI — Interview Prompt Redesign: Maximizing Evidence Quality Per Follow-Up

**Document 25 of the series**
**Status:** Implemented and A/B tested (see §8 — Addendum). Wired into `openrouter.provider.ts`, commit `17cd9be`.
**Scope discipline:** The five-layer architecture (Research Objectives, Conversation Objectives, Interview Policy, Evidence Levels, Evidence Contract) is unchanged. This document elaborates Layer 4 (Interview Policy) — the *reasoning process* behind each follow-up — without touching schema, termination logic, or any other layer.

---

## 1. The Redesigned Prompt Block

This replaces the current (simpler) "INTERVIEW POLICY" section inside `buildMessages`'s `formatInstruction` — everything else in that function (the JSON schema, objectives list, hypotheses list) stays exactly as is.

```
INTERVIEW POLICY — SILENT REASONING (do this in your head before every reply; NEVER show this process, output only its final result):

STEP 1 — Silently summarize, one sentence per Conversation Objective, what evidence you already have for it.

STEP 2 — For each Conversation Objective, judge its current Evidence Level (not_started / in_progress /
weak / medium / strong) per the definitions you've been given.

STEP 3 — Take the least-complete objective that's still relevant. Identify specifically what kind of
evidence it's missing. Check against this list, in this order of priority:
  1. A real, specific story (something that actually happened, not an opinion)
  2. A concrete number attached to that story
  3. How often this happens (frequency)
  4. How much time it costs them
  5. How much money it costs them
  6. What they currently do instead (their workaround)
  7. How they'd judge a solution as good enough (their decision criteria)
  8. What alternatives they've already tried
  Only once the objectives touching items 1-8 are strong should you ask about tools, features, or
  desired improvements — never before.

STEP 4 — Silently generate five different candidate follow-up questions that could surface the specific
missing evidence from Step 3.

STEP 5 — Score each candidate (still silently) on all five of:
  - Evidence Gain: how much genuinely new evidence would this likely surface?
  - Mom Test Compliance: does it ask about a specific past instance, not an opinion or hypothetical?
  - Non-Leading: does it avoid suggesting what the "right" answer sounds like?
  - Naturalness: does it read like something a genuinely curious person would actually say out loud?
  - Conversation Flow: does it follow naturally from what the respondent just said, rather than jumping?

STEP 6 — Choose exactly the single highest-scoring candidate. This is your entire Part 1 reply. Discard
the other four silently — never mention them, never explain this process, never show your work. The
respondent must experience a natural question, never a visible analysis.

HARD RULES — never violate these regardless of what Steps 1-6 produce:
- Never ask two emotionally-framed questions back to back ("how did that make you feel" twice in a row).
  Alternate emotional depth with factual/behavioral questions.
- Never discuss possible solutions, tools, or features before the problem itself has strong evidence —
  no "would a tool that did X help?" until you have a real story, a number, and their current workaround
  on record for that topic.
- Never ask a hypothetical or future-tense question ("would you pay for...", "would you use...") before
  you have strong evidence of real PAST behavior on the same topic. A hypothetical asked too early gets a
  polite, meaningless answer instead of real evidence.
- Never summarize what the respondent just said before every single follow-up — that reads as a robotic
  script, not a conversation. Acknowledge naturally sometimes; never on a fixed schedule; never as a
  formal recap ("So to summarize, you said...").
- Never ask about something already clearly established earlier in this conversation — check the history
  you were given before deciding your question.
```

## 2. Why Each Rule Exists

| Rule | Rationale |
|---|---|
| Silent 6-step reasoning | Forces the model to actually consider multiple options and a rubric before committing, rather than pattern-matching to the first plausible-sounding question — the same reason a human researcher is trained to pause before asking, not just react |
| Evidence priority order (story → number → frequency → time → money → workaround → decision criteria → alternatives → *then* solutions) | This is the Mom Test's actual sequencing, made explicit and mechanical rather than left to the model's judgment. It's also the direct fix for a failure mode Document 22 already found in real transcripts: the AI jumping to generic/habitual questions before anchoring a specific story |
| No two emotional questions in a row | Repeated "how did that feel" questions read as therapy, not research, and risk respondent fatigue (Document 22 §6, psychological safety) |
| No solution-talk before problem evidence is strong | Prevents the interview from turning into an unpaid focus group for a product idea before the problem itself is understood — exactly the sequencing The Mom Test insists on |
| No hypotheticals before strong past-behavior evidence | The single most common Mom Test violation in AI-generated interviews generally — asking "would you pay for X" is nearly free to answer "yes" to when nothing is at stake, so it's worthless as evidence until anchored in real behavior |
| No summarizing every turn | A real, observed pattern from Document 22's transcript review — the AI's tendency to reflect-back constantly reads as scripted rather than curious |
| No repeating already-covered ground | Directly ties to the multi-objective Evidence Level tracking (Document 24) — the model has the conversation history and the current evidence map; asking again wastes a turn and signals it isn't "listening" |

## 3. Good vs. Bad Follow-Up Questions (Real Transcript, Not Invented)

Grounded in this session's actual test conversation (a property owner discussing remote tenant-finding):

> Respondent: *"I own two apartments in Cairo and finding tenants I can trust remotely is really hard."*

| | Question | Why |
|---|---|---|
| ❌ Bad (actual AI output, earlier session) | "How do you currently handle it? Have you had a bad experience recently?" | Two questions in one turn; the second is a leading yes/no invitation |
| ✅ Good (per this redesign) | "Tell me about the last time you had to find a tenant — what happened?" | One question, anchors a specific past instance immediately (Step 3 priority #1) |

> Respondent: *"Last month a tenant stopped paying rent after two months and I had no way to check their background beforehand."*

| | Question | Why |
|---|---|---|
| ❌ Bad | "That must have been really stressful — how did that make you feel?" | Emotional question immediately after a factual one with no number captured yet; risks becoming the *first* of two emotional questions in a row if the next one also probes feelings |
| ✅ Good | "About how much did that end up costing you, between the unpaid rent and anything else?" | Follows the priority order — a number, right after a story, before emotion |

> Respondent: *"I currently rely on my brother to physically meet people and check their ID, which takes forever."*

| | Question | Why |
|---|---|---|
| ❌ Bad | "Would you pay for a service that verified tenants for you?" | Hypothetical asked before workaround evidence is even fully explored, and before a decision-criteria question — a classic premature-solution-talk violation |
| ✅ Good | "How long does that whole process with your brother usually take, start to finish?" | Still mining the workaround (priority #6) for time-cost (priority #4) before ever mentioning a solution |

## 4. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Respondent volunteers a rich, detailed story covering multiple objectives unprompted in one message | Step 2 should mark several objectives `strong` in the same turn (the architecture already supports jumping straight to `strong`, Document 24 §1) — the next question should move to whichever objective is still weakest, not re-ask about what was just fully covered |
| Respondent gives short, evasive, one-word answers repeatedly | After 2 follow-up attempts on the same objective with no improvement, Interview Policy (Document 23 §2, unchanged) says move on gracefully — this redesign doesn't override that backstop |
| Respondent brings up something completely unrelated to any objective | Acknowledge briefly, gently redirect to the nearest relevant objective — never force a rigid script, per the original "feels like a person" design goal (Vision §2) |
| Respondent asks the AI a question back ("why do you need to know this?") | Answer briefly and honestly in character, then return to the interview — never break character, never reveal the reasoning steps or JSON schema (existing anti-injection instruction, unchanged) |
| All objectives reach `strong` well before `maxTurns` | Interview should end per the existing completion rule (Document 24) — this redesign does not add artificial delay to "use up" remaining turns |
| Respondent explicitly says they'd rather not discuss a topic | Respect it immediately, move to a different objective — psychological safety (Document 22 §6) overrides evidence-completeness for that one objective |

## 5. Prompt Optimization Suggestions

- **Token cost tradeoff, stated plainly:** this instruction block is substantially longer than the version it replaces, which adds real input tokens to every single turn (Document 16's cost model). At current illustrative pricing this is still a fraction of a cent per turn, but it's the right tradeoff to name explicitly rather than pretend it's free.
- **Revisit after real data, not before:** once a real validation round produces transcripts, check empirically whether the model reliably follows the priority ordering with a *shorter* instruction — if so, the explicit 5-candidate/5-criteria scoring language (Steps 4-5) could likely be condensed to a one-line reminder without losing behavior, saving tokens on every subsequent turn.
- **Consider few-shot over instruction density:** if condensing the written rules doesn't hold up, 1-2 concrete good/bad example pairs (like §3 above) embedded directly in the prompt often steer models more reliably per token spent than additional prose instructions.

## 6. Evaluation Checklist (Per Transcript, Human-Reviewed)

- [ ] Did any two consecutive AI questions both probe emotion?
- [ ] Did the AI mention a tool/solution/feature before the relevant objective had strong evidence?
- [ ] Did the AI ask a "would you..." / "will you..." question before establishing real past behavior on the same topic?
- [ ] Did the AI summarize the respondent's own words before more than one follow-up in the transcript?
- [ ] Did the AI ask about anything the respondent had already clearly stated earlier?
- [ ] For each objective that reached `strong`, can you point to a specific number (cost, time, or frequency) in the transcript that justifies it — not just a vibe?
- [ ] Did the AI ever ask two questions in a single turn?

## 7. Regression Test Scenarios

Scripted respondent personas to run through the emulator (extending Document 18's testing philosophy to prompt quality, not just code correctness):

1. **"The Oversharer"** — gives a long, detailed answer covering 3 objectives in message 1. Expect: evidence levels jump straight to `strong` for all three; next question targets only the remaining gap.
2. **"The Vague One"** — answers every question with one vague sentence. Expect: two follow-up attempts per objective, then graceful move-on (no infinite probing).
3. **"The Solution-Jumper"** — asks "so will you guys have a mobile app?" in message 2. Expect: AI acknowledges briefly, redirects to problem evidence, does not engage the product question yet.
4. **"The Emotional One"** — every answer is heavy with feeling, light on facts. Expect: AI's follow-ups alternate toward factual/numeric questions rather than compounding emotional ones.
5. **"The Early Ender"** — says "I think that's everything I can think of" at turn 4. Expect: `respondentIndicatedNoMoreToAdd` fires, interview ends even though not all objectives are `strong`.

---

## 8. Addendum — Real A/B Test Result (Not Simulated, Not Estimated)

**Method:** the exact same scripted 8-message conversation (a property owner describing tenant-finding problems, real OpenRouter calls, `openai/gpt-4o-mini`) was run twice against two separately-generated but comparable Idea-Intake projects — once against the prompt as it existed *before* this document (baseline), once *after* wiring in §1's redesigned block. Both transcripts were reviewed line-by-line against this document's own Evaluation Checklist (§6).

| Checklist Item | Before | After | Verdict |
|---|---|---|---|
| Two questions in one turn | 2 occurrences | 2 occurrences | ❌ No improvement |
| Reply opens with a summarizing preamble ("يبدو أن...", "من الواضح أن...") | 6 of 6 turns | 6 of 7 turns | ⚠️ Marginal |
| Repeated emotional ("how did that feel") questions | 3 occurrences | ~1 occurrence | ✅ Real improvement |
| Solution/tool talk raised before problem evidence was strong | Only at the very end | As early as turn 3 | ❌ Slightly worse |

**Honest interpretation:** this is a partial, mixed result — not the clean win a first read of §1 might suggest. Critically, the two most mechanically-checkable rules (one question per turn; no forced preamble) were **already present as explicit hard rules in the prompt this document replaced** — and the model violated them at close to the same rate regardless. This points away from "the instructions weren't clear enough" and toward a different diagnosis: **`gpt-4o-mini` does not reliably hold this many simultaneous behavioral constraints across turns**, independent of how the prompt is worded. Confirmed via commit `17cd9be`'s message and this addendum — not asserted from memory, written down at the time the test ran.

**Agreed next steps (founder-directed sequencing):**
1. Document the result here (this section) — done.
2. Design a code-level **Interview Orchestrator** ([Document 26](./26-interview-orchestrator.md)) that measures these specific violations deterministically per turn, rather than relying solely on the model to self-police.
3. Implement the Orchestrator.
4. **Only if** `gpt-4o-mini` still shows the same violation rate *after* the Orchestrator is in place, evaluate a stronger model on the interview-turn call specifically — same scripted test, same checklist, real numbers again.
