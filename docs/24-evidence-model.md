# InsightAI — Evidence Model (Layer 5: Evidence Contract)

**Document 24 of the series**
**Status:** Design only — no code changed. Referenced by [Document 23](./23-prompt-architecture-redesign.md)'s Layer 5.
**Purpose:** Formally define the evidence-strength lifecycle every Conversation Objective moves through during an interview, so "the interview may finish" has a precise, checkable meaning instead of a vibe.

---

## 1. Reconciling a Naming Gap

The approved instruction named a 4-stage progression (Not Started → In Progress → Weak → Strong → Verified) but separately asked this document to formally define **four evidence levels: Weak, Medium, Strong, Verified** — which implies a level between Weak and Strong that the stage-progression list skipped. Resolved here, explicitly, rather than silently picking one: **the lifecycle is six states**, with Medium inserted where the two instructions both point:

```
Not Started → In Progress → Weak Evidence → Medium Evidence → Strong Evidence → Verified
```

**Important:** this describes evidence *quality classification*, not a mandatory turn-by-turn walk. An objective can jump straight from Not Started to Strong in a single turn if the respondent volunteers a rich, detailed story unprompted — nothing about this model requires slowly stepping through every stage.

## 2. The Six States, Formally Defined

| State | Definition | Can this end the interview for this objective? |
|---|---|---|
| **Not Started** | No respondent message has touched this objective's topic yet | No |
| **In Progress** | The topic has come up, but the respondent hasn't yet said anything substantive about it | No |
| **Weak Evidence** | A vague, general, or hedged statement — an opinion or habitual generalization, not a specific instance | No |
| **Medium Evidence** | A specific instance is named, but thin on detail — missing when/how/cost/outcome | No |
| **Strong Evidence** | A concrete, detailed account: what happened, when, what they did about it, what it cost (time/money), how it affected them | **Yes** |
| **Verified** | The respondent has explicitly confirmed the interviewer's understanding of this specific piece of evidence is accurate | **Yes** |

**How an objective reaches Verified:** this is the direct mechanism behind the Respondent Verification step proposed in [Document 22](./22-interview-experience-review.md) §5 — the end-of-interview summary-and-confirm step is exactly where Strong Evidence graduates to Verified. The two documents are designed to work together: Document 22 supplies the *UX mechanism*, Document 24 supplies the *state it updates*.

## 3. Concrete Worked Example (One Objective, Traced Through All Six States)

**Conversation Objective:** *"Understand a specific recent situation where they needed to handle government or legal paperwork in Egypt while living abroad."*

| State | Example respondent message | Why it's classified this way |
|---|---|---|
| Not Started | *(no message yet)* | — |
| In Progress | "Yeah, dealing with paperwork back home is annoying." | Topic acknowledged, zero specifics |
| Weak Evidence | "It's always a hassle, I never really know what documents I need." | General/habitual complaint, opinion-flavored, no dated instance |
| Medium Evidence | "Last year I needed a power of attorney done and it took forever." | One specific instance named ("power of attorney," "last year") but no cost, no full story, no outcome |
| Strong Evidence | "Last March I needed a power of attorney so my brother could sell my apartment. It took 6 weeks, cost me about 3,000 EGP in courier and notary fees, and I nearly lost the buyer because of the delay. I was really stressed since I couldn't be there in person." | Concrete: when, what, cost, time, emotional impact, consequence — everything `MessageClassification`'s fields (`moneyLostEstimate`, `timeLostEstimateHours`, `emotion`, `painPoint`) can be populated from with real confidence |
| Verified | AI's closing summary: *"So last March you needed a power of attorney for your brother to sell the apartment — it took about 6 weeks, cost roughly 3,000 EGP, and the delay almost cost you the buyer. Did I get that right?"* → Respondent: *"Yes, exactly."* | Respondent-confirmed — the highest-trust evidence category the product can produce |

## 4. Why the Weak → Medium → Strong Boundary Is Drawn Here (Not Somewhere Else)

The line is drawn at **"can this evidence populate a structured classification field with genuine confidence, not a guess?"** — Weak and Medium evidence would force `MessageClassification`'s numeric/categorical fields (money lost, time lost, urgency) to be inferred or guessed by the model from thin material, which is exactly the kind of fabricated-precision the whole project has explicitly rejected since [Document 21](./21-validation-protocol.md)'s "No Fabricated Precision" principle. Strong Evidence is the point where those fields stop being inferred and start being *read off* what the respondent actually said.

## 5. What This Model Explicitly Does Not Do

- It does not score evidence with a number (e.g., "72% strong") — states are categorical, not scalar, for the same reason hypothesis confidence isn't a percentage (ADR-0017): categorical labels backed by a concrete example are auditable; invented scalars aren't.
- It does not require every objective to individually reach Verified — Strong Evidence alone is sufficient to let the interview finish; Verified is the *better* outcome the Document 22 confirmation step aims for, not a hard requirement for every single objective before the interview can end.
- It does not apply to Research Objectives (Layer 2) or Hypotheses at all — this is strictly a per-Conversation-Objective (Layer 3) concept, consistent with ADR-0021's one-directional flow rule.

---

**Awaiting approval to implement, alongside Document 23.**
