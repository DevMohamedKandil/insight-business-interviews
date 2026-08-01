# InsightAI — First User Validation Protocol

**Document 21 of the planning series** (continuing the numbering from Documents 1-20)
**Owner:** Founder, acting as Head of Product Validation for this phase
**Status:** Active — use this document, don't just read it once
**Scope note ([Document 28](./28-validation-sprint-policy.md)):** everything below assumes Sprint 1's confirmed mode — face-to-face, `localhost`, observer present. The "First User Protocol" (§2) in particular is written for an in-person handoff, consistent with that policy.

---

## Governing Rule for This Entire Phase

> **No new features are recommended unless at least three different users independently surface the same thing.** Every conclusion in every template below must point to something a real user actually did or said — never an assumption, never a guess, never an invented confidence number. If the evidence isn't there yet, the honest answer is "unknown" or "not enough signal," exactly like an untested hypothesis in the product itself.

This mirrors the product's own "Evidence First" taxonomy (Evidence / Inference / Hypothesis / Recommendation) — the founder is now subject to the same discipline the product enforces on respondents' data.

---

## 1. Founder Testing Checklist (Complete Before Sending to ANY User)

Run this fully, in order, the same day you plan to test — not from memory of "it worked last week."

**Environment**
- [ ] Correct target confirmed (emulator vs. real deployed environment) and you know which one the test link points to
- [ ] The specific template/link you'll send resolves and is `live` (not `draft`/`paused`)
- [ ] You know the current `dailySpendCapUsd` and global cap, and they're high enough for at least a handful of full test sessions

**Login**
- [ ] Admin login works with the account you'll use to review results afterward
- [ ] A fresh anonymous session starts silently when the test link is opened (no visible login step, no error)

**AI Generation**
- [ ] Send at least one real test message yourself and get a real, in-character reply (not an error, not a generic fallback)
- [ ] Confirm the reply is a genuine response to what you said, not a repeat of the welcome message or something generic

**Streaming**
- [ ] Reply text appears progressively (word-by-word feel), not as one block dropped in after a long pause
- [ ] The typing indicator appears before text starts, and disappears once text starts — no overlap, no indicator stuck on screen

**Firestore**
- [ ] The test session you just ran actually created a `sessions` document and `messages` documents (check the console/emulator UI, don't assume)
- [ ] Turn count, coverage-goal progress, and cost fields on the session are updating as you send messages

**Error Handling**
- [ ] Deliberately cause one failure (e.g., briefly disconnect network mid-message) and confirm the UI shows a clear "something went wrong, try again" state rather than hanging forever
- [ ] Confirm sending a message again after that failure works normally (the session isn't left in a broken state)

**Logging**
- [ ] After your test session, confirm you can find a log/audit entry for it (cost, latency, model used) — if a user has a problem, you need to be able to look it up afterward, not guess

**Do not send the link to a real user until every box above is checked on the exact link/environment you're about to send.**

---

## 2. First User Protocol — The Introduction (Under 60 Seconds)

**Say this, close to verbatim. Do not deviate to explain, sell, or reassure.**

> "Thanks for doing this. I'm testing something I built — there's no right or wrong way to use it, and you can't break anything. I'm just going to watch and won't jump in unless you're totally stuck. Feel free to think out loud if that's comfortable, but no pressure. Here's the link — whenever you feel like you're done, just tell me."

Then hand over the link and go silent.

**Explicitly forbidden in the introduction:**
- Do not say what InsightAI is, what problem it solves, or why you built it.
- Do not say the word "AI interview," "survey," "startup," or "research" if you can avoid it — let them describe what they experienced in their own words afterward, uncontaminated by your framing.
- Do not reassure them it's "quick" or "easy" or "interesting" — any adjective is a bias.
- Do not hover, nod along, or react visibly to their answers while they're in the conversation.

If they ask "what is this?" mid-session, the only acceptable answer is: *"Just answer however feels natural — I'll explain everything after."*

---

## 3. Observation Checklist (While the User Interacts)

Watch silently. Take notes without narrating what you're writing.

### Critical (a signal the core loop itself may be broken)
- [ ] User doesn't understand what to do at all (stares at the screen, asks "what do I do here?")
- [ ] User abandons within the first 1-2 exchanges
- [ ] User explicitly voices distrust ("is this real?", "who sees this?", "is this a bot/scam?")
- [ ] User gives one-word or dismissive answers throughout — no real depth, nothing usable as evidence
- [ ] A technical failure occurs during the session (stuck, error, crash) and they can't recover
- [ ] The AI asks something visibly repetitive or contradicts something already said (a memory/context failure visible to the user)

### Important (usability/quality signals, not necessarily fatal)
- [ ] Hesitation before typing — how long, do they re-read the question first?
- [ ] Confusion about whether/when it's "done"
- [ ] A question gets skipped, ignored, or answered with "I don't know" without follow-up
- [ ] They scroll up / re-read earlier messages
- [ ] They ask you a clarifying question mid-session
- [ ] Their tone shifts — rushing to finish, visibly bored, or the opposite (leaning in, typing more)

### Nice to Know (texture — useful later, not urgent)
- [ ] Exact phrasing they use for their pain point (write the quote verbatim — this is real evidence, not paraphrased)
- [ ] Device/browser, time of day, where they are
- [ ] Whether they mention wanting to show/send this to someone else
- [ ] Any spontaneous emotional reaction (laugh, sigh, "oh that's a good question")

---

## 4. Interview Debrief (Ask Immediately After, Mom Test Style)

**Rule: ask about specific past behavior and what just happened, never opinions, hypotheticals, or anything that invites a compliment.**

Ask, roughly in this order:

1. "Walk me through what was going through your head while you were answering."
2. "Was there a moment you weren't sure what to do, or what it was asking? Which one was that?"
3. "Was there a question that felt off, confusing, or hard to answer? Tell me about that one."
4. "Before today, tell me about the last time you actually dealt with [the specific thing the interview was about] — what did you do?"
5. "If this hadn't existed and someone just asked you these questions over text, would anything have felt different?"
6. "Did anything surprise you, in either direction, during this?"
7. "Who's the last person you know who's dealt with something like this?"

**Never ask:** "Did you like it?" / "Would you use this?" / "Do you think this is a good idea?" / "How likely are you to recommend this?" — these fish for opinions and politeness, not evidence, and every one of them is a leading question by Mom Test's own definition.

---

## 5. Success Metrics (Definitions Only — No Targets Set Here)

These are what to *measure*, not what counts as "good" — target thresholds come later, once you have enough sessions to know what's realistic, not before.

| Metric | Definition |
|---|---|
| Completion Rate | Completed sessions ÷ started sessions |
| Average Interview Duration | Mean of (`endedAt` − `startedAt`) across completed sessions |
| Average Answer Length | Mean word/character count of respondent messages |
| Drop-off Point | Distribution of `turnCount` at the moment of abandonment (where, not just how often) |
| Approval Rate (Idea Intake) | Drafts approved ÷ drafts generated |
| Evidence Generated | Count of `hypothesisEvidence` entries where `evidenceType != 'neutral'`, per session and per hypothesis |
| Resume Usage Rate | Sessions resumed ÷ sessions started (tests whether cross-device resume is even used) |
| Follow-up Question Quality | **Subjective, founder-logged, never system-computed** — did the AI's next question genuinely build on the previous answer, or did it feel generic/repetitive? Log as a short note per session in the Journal (Section 7), explicitly labeled as your own judgment, not a score the system produced — inventing an automatic "quality score" here would itself violate the no-fabricated-confidence rule. |

---

## 6. Failure Signals (Concrete, Not Vague)

Any of these, seen more than once, is the product telling you something — write it down, don't rationalize it away in the moment.

- Users don't understand the first screen or don't realize they can just start typing
- Users abandon after one or two exchanges, repeatedly (not a single outlier)
- Users express distrust or discomfort about who's on the other end
- Users answer with one word, repeatedly, across users — no real evidence is coming out
- Users ignore the AI's actual question and ask their own instead
- The AI asks something repetitive, or a question already answered earlier in the same session
- The conversation starts to feel like filling out a form rather than talking to someone
- Nobody engages past the bare minimum needed to finish — no organic curiosity or extra detail volunteered
- You (the founder) have to explain or coach someone through the flow for it to work — meaning it doesn't stand on its own

---

## 7. Founder Journal Template (Fill In After Every Single User)

```
Date: __________
User Type (who they are, not their name): __________
Idea / Template Tested: __________

Observations (what happened — facts, not interpretation):


Unexpected Findings (anything you didn't expect going in):


Hypotheses Validated (which project hypotheses, and what evidence — quote it):


Hypotheses Rejected (which ones, and what evidence contradicted them):


New Questions (things this session raised that you don't have an answer to yet):


Decision:
[ ] Continue as-is
[ ] Pivot (what, specifically, and why)
[ ] Kill (what, specifically, and why)
```

---

## 8. Validation Report Template (After Every 5 Users — Not Before)

Five is the minimum before looking for patterns — a single session is an anecdote, not a pattern.

```
Report covering users #___ through #___
Date range: __________

Patterns (things that showed up in more than one session):


Repeated Problems (the same friction/confusion point, seen independently, with a count):


Evidence (aggregated — real quotes, real counts, not summarized-into-vague-adjectives):


Unexpected Opportunities (things users brought up unprompted that weren't in scope):


Product Improvements (ONLY list something here if at least 3 different users independently
surfaced it — per the standing rule. If nothing has crossed that bar yet, write
"insufficient signal — no item has independent confirmation from 3+ users yet."):


New Hypotheses (emerging from patterns — phrased as untested claims, not conclusions,
same as every other hypothesis in this product):

```

**Do not use this report to plan implementation work.** Its only job is to make sure you actually learned something from five real people, in a form you can look back on later.

---

## 9. Standing Rules for This Entire Validation Phase

1. No new feature is discussed, let alone built, until at least **three independent users** have surfaced the same signal.
2. Every conclusion must cite an observed behavior or an exact quote — never "I think users would probably..."
3. No fabricated confidence, ever — a pattern seen twice is "two users, watch for a third," not "most users."
4. When in doubt about whether something is evidence or your own interpretation, write both down separately, labeled.
5. This is validation, not a pitch — if you catch yourself explaining, reassuring, or defending the product mid-session, stop and note it in the Journal as a process deviation, not just something to feel bad about.
