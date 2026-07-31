# InsightAI — Prompt Architecture Redesign: Separating Project-Level and Conversation-Level Objectives

**Document 23 of the series**
**Status:** Design only — no code changed. Awaiting explicit approval before implementation, per instruction.
**Triggered by:** A real, reproduced failure — the "Remote Tenant Matching Service" interview terminated after exactly 1 turn because its sole coverage goal was `"Interview at least 20 property owners in Egypt..."`. The model, correctly, judged that goal satisfied the instant it recognized it was talking to one. The bug isn't in the code path — it's that one undifferentiated field (`coverageGoals`) was being asked to hold two fundamentally different kinds of objects.

---

## 1. The Core Distinction

| | Research Objective (Layer 2) | Conversation Objective (Layer 3) |
|---|---|---|
| Who it's for | The founder, planning the study | The AI, running one conversation |
| Example | "Interview at least 20 property owners" | "Get one recent, specific story" |
| Satisfied by | Running many interviews over time | One good answer in one conversation |
| Visible to the interviewer model | **Never** | Always (this is its job list) |
| Can end an interview | **Never** | Yes — this is the only thing that can |

Every failure mode in this document is a variation of these two getting mixed into the same field, the same prompt, or the same array.

## 2. The Five Layers

**Revision note (post-approval refinement):** Layer 4 was originally scoped narrowly as "Interview Completion Rules." It's renamed **Interview Policy** below because termination turned out to be one of several related behavioral decisions the interviewer has to make continuously, not a special case — and a new **Layer 5, Evidence Contract**, now carries the formal definition of what "enough evidence" actually means (full definition in [Document 24](./24-evidence-model.md), not duplicated here).

### Layer 1 — Project Metadata
`generatedTitle`, `description`, `category`, `businessModelCandidates`, `customerSegments`, `personas`, `killCriteria`, `successMetrics`. Founder-facing only. **Already correctly isolated today** — confirmed by reading `InterviewService.processTurn`'s system-prompt construction, which never references any of these fields. No change required here.

### Layer 2 — Research Objectives (NEW field, founder-only, never sent to the interviewer)
Sample-size targets, segment-comparison plans, validation milestones — anything about *the study as a whole*, across many respondents. Examples: "Interview at least 20 property owners," "Compare urban vs. rural landlords," "Validate demand before building." **This is a new, explicit field that does not exist in the schema today** — today's single `coverageGoals` array is where this content currently ends up by accident.

### Layer 3 — Conversation Objectives (the only thing sent to the interview model)
What one conversation, right now, should uncover. Examples: "Get one recent, specific story," "Understand their current workaround," "Surface the emotional frustration, not just the facts," "Ask at least one follow-up per topic before moving on." This is what today's `coverageGoals` field *should* exclusively contain — and mostly does for hand-authored templates (`egyptians-abroad`'s goals are correctly conversation-level), but does not for AI-generated ones, because nothing in the schema or the generation prompt forces the distinction.

### Layer 4 — Interview Policy (renamed from "Interview Completion Rules")
Governs every ongoing behavioral decision the interviewer makes, not just when to stop:

| Decision | Policy |
|---|---|
| **When to ask a follow-up** | If the active conversation objective's evidence (Document 24) is below Strong, and the respondent's last message was relevant to it, ask exactly one deeper follow-up ("what happened next," "what did that cost you," "how did that feel") rather than jumping to a new topic |
| **When to change topics** | Once the active objective reaches Strong Evidence or Verified, **or** after a bounded number of follow-up attempts (2) yield no improvement — move to the next uncovered objective rather than pressing indefinitely |
| **When to revisit an earlier answer** | If a later answer meaningfully adds to or contradicts an already-Strong objective, the interviewer may circle back **once** ("earlier you mentioned X — does that connect to this?") — never more than once per objective, to avoid the interrogation-feel flagged in Document 22 |
| **When to ignore weak evidence** | If an objective has received its 2 follow-up attempts and evidence is still Weak, move on gracefully rather than continuing to press — respondent comfort (Document 22 §6, psychological safety) outweighs completeness for any single objective |
| **When to finish** | Only per Layer 5's Evidence Contract completion rule (§ below) — never because a Layer 2 objective was satisfied, which is structurally impossible since Layer 2 is never in the model's context at all |

### Layer 5 — Evidence Contract
Every Conversation Objective carries a lifecycle (Not Started → In Progress → Weak → Medium → Strong → Verified) — **fully defined, with concrete examples, in [Document 24 — Evidence Model](./24-evidence-model.md)**, not repeated here to avoid two competing definitions.

**The interview may finish only when:**
- ✅ Every Conversation Objective has reached **Strong Evidence or Verified**, **or**
- ✅ The respondent has explicitly indicated they have nothing more to add

An interview must **never** end because a Layer 2 research objective was satisfied — enforced structurally, by Layer 2 never being present in any prompt the interview model receives, not by a rule the model is trusted to follow.

## 3. What About Hypotheses? (A Gap in the 4-Layer Framing, Reconciled Here)

Hypotheses aren't cleanly Layer 2 or Layer 3 — they're founder beliefs (Layer-2-like) that the interview model still needs to *see*, but only to **tag evidence against**, never to decide what to ask or when to stop. This already works correctly today (`ADR-0018`'s prompt explicitly says *"Your job is only to tag relevance per message"* and the termination check (`allGoalsSatisfied`) never references hypotheses at all — confirmed by code review). Naming this explicitly: **hypotheses are a read-only classification target, structurally excluded from both the question-selection logic and the termination logic.** No change required, but this document is where that guarantee is now written down so it doesn't get accidentally blurred during the Layer 2/3 split.

## 4. Full Leak Audit — Every Place Project-Level Concepts Touch Interview Execution Today

| # | Location | What Can Leak | Risk | Redesign |
|---|---|---|---|---|
| 1 | `Project.coverageGoals` (single field, `project.types.ts`) | Research-plan goals and conversation topics, same array, same shape — nothing distinguishes them | 🔴 **Confirmed root cause** of the 1-turn termination bug | Split into `Project.researchObjectives: string[]` (Layer 2) and `Project.conversationObjectives: ConversationObjective[]` (Layer 3, renamed from `CoverageGoal` to make the intent unmistakable at the type level) |
| 2 | `IdeaIntakeService.approveDraft()` — direct pass-through `coverageGoals: project.coverageGoals` onto `TemplateVersion` | Whatever Layer-2-flavored content ended up in the single field flows straight into what the interview engine reads | 🔴 High — this is the literal pipe the leak travels through | `TemplateVersion` gains **only** a `conversationObjectives` field, populated from `project.conversationObjectives`. `TemplateVersion` has no field at all for research objectives — structurally impossible to carry them forward, not just discouraged |
| 3 | `generateProjectDraft`'s meta-prompt (`openrouter.provider.ts`) — asks for one `coverageGoals` array with a generic instruction | The model has no signal distinguishing "a founder plan item" from "a conversation topic" — it reasonably produced the former under a field named to sound like the latter | 🔴 High — this is what actually generated the bad content | Rewrite the meta-prompt to request the two arrays **separately**, each with a contrasting good/bad example (see §5), plus an explicit negative constraint: conversation objectives may never mention a sample size, a count of people, or "interview" as a group activity |
| 4 | `InterviewService.processTurn` → `remainingCoverageGoals` → `OpenRouterProvider.buildMessages`'s "Remaining coverage goals" block | The final delivery point — whatever reaches here, the model is told to try to satisfy | 🟡 Medium once #1-3 are fixed (this pathway will only ever carry genuine Layer 3 content) — kept as defense-in-depth | Add a lightweight runtime sanity check here too: reject/log a warning if a conversation-objective description matches an obvious research-plan pattern (a number followed by "people"/"users"/"respondents") — a safety net, not the primary fix |
| 5 | `TemplateVersion.killCriteriaSnapshot` | Could theoretically leak founder kill-conditions into the interviewer's framing | ✅ **No change required** — confirmed by code read: this field is never referenced anywhere in `InterviewService` or `OpenRouterProvider`. Written at approval time, read only by (future) Phase 2 analysis |
| 6 | `successMetrics`, `businessModelCandidates`, `customerSegments`, `category`, `description` (Project-level) | Could leak founder business-planning framing into the conversation's tone | ✅ **No change required** — confirmed: `processTurn`'s system prompt only ever concatenates `version.prompt + version.conversationRules + language` |
| 7 | `activeHypotheses` passed to the model | Could steer questions or influence termination, not just tagging | ✅ **No change required**, reconciled explicitly in §3 — already read-only/classification-only by design, confirmed in both the prompt text and the termination check |
| 8 | `Template.targetAudience` | Could leak segment-planning language into the conversation | ✅ **No change required** — not referenced in system-prompt construction |
| 9 | `maxTurns` | Not a goal at all — a hard safety ceiling | ✅ **No change required**, but worth naming: this is a Layer 4 *backstop*, orthogonal to the objective-satisfaction logic, and should stay that way (it's what currently masks how badly a bad Layer 3 goal can behave — without it, a bad goal could keep an interview running forever instead of ending it in one turn; with the Layer 2/3 split fixed, this backstop becomes a true "shouldn't normally be hit" ceiling again) |

## 5. Meta-Prompt Redesign (Text, Not Yet Wired In)

The `generateProjectDraft` system prompt (`openrouter.provider.ts`) should be restructured to request Layer 2 and Layer 3 as visibly separate JSON arrays, each anchored with the founder's own contrasting examples:

```
"researchObjectives": string[]   // FOUNDER'S OWN STUDY PLAN. Never seen by the interviewer.
    // GOOD: "Interview at least 20 property owners in Egypt"
    // GOOD: "Compare urban vs. rural landlords' willingness to pay"
    // These describe the STUDY, not any one conversation.

"conversationObjectives": [{ "id": string, "description": string }]
    // What ONE conversation, right now, should uncover. This is the ONLY thing
    // sent to the AI running the interview — nothing else on this page reaches it.
    // GOOD: "Get one specific, recent story about the problem"
    // GOOD: "Understand what they currently do instead"
    // GOOD: "Surface how the problem made them feel, not just the facts"
    // NEVER include a sample size, a count of people, or "interview"/"survey"
    // as something done to a group — if you write a number of respondents
    // anywhere in this array, you have made the error this schema exists to prevent.
```

## 6. Termination Signals (Superseded by the Evidence Contract)

This section originally proposed a simple `evidenceStrength: 'thin' | 'solid'` flag. **Superseded** by Layer 5's full five-stage Evidence Contract (Document 24), which replaces it with more precision: termination now requires every objective at Strong/Verified, not a binary thin/solid split. The second signal proposed here — **respondent-signaled completion** — stands as originally designed: a structured-output boolean (`respondentIndicatedNoMoreToAdd`), populated only when the respondent's own words clearly signal closure, mirroring how `selfReportedInjectionAttempt` already works today. Document 24 incorporates both into the single completion rule.

## 7. Permanent Architecture Rules

Logged formally as **ADR-0021** ([ADR Log](./adr/ADR-LOG.md)) — binding on all future work in this area, not just this redesign:

1. **Project Objectives (Layer 2 / Research Objectives) must never be passed directly to the interview model.** Enforced structurally (no field carries them into `TemplateVersion` or any prompt), not by a convention someone could forget.
2. **Conversation Objectives must never modify Research Objectives.** Layer 2 → Layer 3 derivation happens once, at draft-generation time, authored by the founder-facing meta-prompt. At runtime, nothing that happens inside a live conversation ever writes back to `Project.researchObjectives` — the flow is one-directional.
3. **Evidence is the only artifact allowed to flow back into research.** The sole channel from a live conversation back toward anything research-facing is the Evidence Contract itself (evidence log entries, classification, hypothesis tags) — never a raw conversation objective, never the interview model rewriting founder-authored planning content.

## 8. What This Document Deliberately Does Not Do

No code is touched. `Project`/`TemplateVersion`/`CoverageGoal` types, `IdeaIntakeService`, and `openrouter.provider.ts`'s meta-prompt all remain as-is until this design is approved. The hand-authored `egyptians-abroad` template is unaffected either way — its conversation-level goals were already correct.

---

**Awaiting approval to implement.**
