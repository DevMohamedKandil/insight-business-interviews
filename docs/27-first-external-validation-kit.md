# InsightAI — First External Validation Kit (Validation Sprint 1)

**Document 27 of the series**
**Status:** Ready for First External Validation. Operational kit — no code, no prompt changes, no architecture changes. System frozen per instruction.
**Scope:** Everything needed to run interview #1 with a real external participant, and to record what happens without contaminating evidence with interpretation.
**Mode (confirmed, [Document 28](./28-validation-sprint-policy.md)):** Face-to-face, `localhost`, observer (you) present, on your laptop. No remote participants, no deployment, for the entirety of Sprint 1.

---

## 0. Blocker Assessment — Resolved

The one gap this document originally flagged (localhost is only reachable on the machine running the emulator) is **not a blocker under the confirmed policy** — Sprint 1 is explicitly face-to-face, same-laptop, per Document 28. The remote-access question that would have made this a hard blocker is a Sprint 2 concern, deliberately deferred, not an open item here.

**Ready for First External Validation.**

---

## 1. Checklist Before Inviting the Participant

- [x] Mode confirmed: face-to-face, your laptop, `localhost` (Document 28)
- [ ] Emulator Suite running (`firebase emulators:start`) — confirm all four services up, not just assumed
- [ ] `ng serve` running at `localhost:4310`
- [ ] Decided which template/topic is actually relevant to *this specific participant* — do not default to whichever one was last used for a technical test
- [ ] Opened that template's link yourself, once, silently, in the last hour — confirm the welcome message and language are correct for this real person (not leftover test copy)
- [ ] Device fully charged, notifications silenced (yours and, if possible, ask them to silence theirs)
- [ ] Quiet space, participant physically comfortable, no rush signaled
- [ ] §5 and §6 templates below open and ready *before* the participant arrives — not created afterward from memory
- [ ] You have re-read §2's moderator script once, out loud, in the last few minutes — not reading it live for the first time
- [ ] You have a calm, pre-decided line for a technical hiccup (e.g., "one second, let me refresh") — decided now, not improvised under pressure
- [ ] You are mentally committed to staying silent during the interview itself (§2 covers this) — this is the single easiest rule to break in the moment

## 2. Moderator Guide — What You Say, In Order

**Before handing over the device:**
> "Thanks for doing this. I'm testing something I built — there's no right or wrong way to use it, and you can't break anything. I'm just going to watch and won't jump in unless you're totally stuck. Feel free to think out loud if that's comfortable, but no pressure."

**Hand over the device already open to the interview link. Say nothing else about what it is.**

**If they ask "what is this?" before or during:**
> "Just answer however feels natural — I'll explain everything after."

**While they're in the conversation:** silent. No nodding along visibly, no reacting to their answers, no explaining a question they seem to hesitate on. If they're stuck for more than a few seconds and look at you, the *only* acceptable prompt is: *"Just say whatever comes to mind — there's no wrong answer."* Nothing more specific.

**When they say they're done:** don't rush to the debrief. Let a beat pass, then move to the post-interview questions (already in Document 21 §4 — reuse those verbatim, not repeated here).

**Explicitly forbidden the whole time:** explaining the product, saying why you built it, reassuring them it's "quick" or "interesting," reacting with visible enthusiasm to a good answer.

## 3. Participant Invitation Message (Arabic, Under One Minute to Read)

> مرحبًا! 👋
> بجرّب حاجة جديدة عملتها، وحابب رأيك الصادق فيها. الموضوع محادثة بسيطة هتاخد منك حوالي 5 دقايق بس، مفيش صح أو غلط، وأي كلام هتقوله يفيدني جدًا.
> تقدر تساعدني؟ 🙏

**Deliberately excluded:** what the product is, what problem it solves, the word "AI," "مقابلة" (interview, sounds formal/survey-like), any framing that primes an answer.

## 4. Post-Interview Checklist

- [ ] Thank them genuinely, in person, before doing anything else
- [ ] **Immediately** (same minute, before the debrief questions fade from memory) note the session's rough start time so you can find it in Firestore later
- [ ] Ask the Document 21 §4 debrief questions — do not skip this because "it felt like enough already"
- [ ] Fill §5 (Observation Template) **before** looking at the Firestore transcript — your immediate memory of what you *saw* matters and fades fast; the transcript will still be there in an hour
- [ ] Only after §5 is filled: open the actual session in Firestore/emulator UI, confirm it completed, note the session ID
- [ ] Fill §6 (Evidence vs. Interpretation) using the real transcript, not memory, for anything you quote
- [ ] Do not discuss the session with anyone else, or form a "so customers think..." conclusion, until §7 is applied

## 5. Observation Recording Template (Fill Immediately After, From Memory)

```
Date/time: __________
Participant (role/context, not name): __________
Mode: In-person / Remote
Template used: __________

CRITICAL observations (core loop broken?):


IMPORTANT observations (hesitation, confusion, skipped questions):


NICE TO KNOW (tone, device, phrasing, anything volunteered unprompted):


Did I (the moderator) break character or explain anything I shouldn't have? Be honest:


My gut reaction, unfiltered (this is not evidence — just get it out of your head):

```

## 6. Evidence vs. Interpretation Template (Fill After Reviewing the Real Transcript)

**Rule: every row's left column must be something that could be shown to someone else and verified — a quote, a timestamp, a fact. The right column is your opinion. Never write in the wrong column.**

```
EVIDENCE (exact quote / observed fact)          | INTERPRETATION (what I think it means)
-------------------------------------------------|------------------------------------------
"..."                                             |
Participant paused N seconds before answering Q# |
Participant asked "what do I do now?"             |
[session completed / abandoned at turn N]        |
```

## 7. Decision Framework for Interview #1

### Counts as a successful first interview
- Participant completed the flow without you needing to explain or coach the interface itself
- At least one real, specific story was told (not just opinions or generalities) — quotable, per §6
- No technical failure interrupted or blocked completion
- Participant did not express distrust or discomfort about who/what they were talking to

### Counts as a failed first interview
- You had to explain or operate the interface for them
- A technical error stopped the session and it couldn't recover
- Every answer was one word or pure opinion — no real story surfaced at all
- Participant asked to stop, or clearly wanted to

### Explicitly ignore after only one interview (do not act on any of these yet)
- Any single odd phrasing choice by the AI (n=1 tells you nothing about rate)
- Whether this one person would personally pay for anything
- Any feature this participant suggests — log it as a **Future Idea** only; the Feature Rule requires three independent participants or a Critical blocker, and one person is neither
- Any conclusion starting with "customers think..." or "people want..." — one data point is an **Observation**, never **Evidence** of a pattern
- Whether the `multiple_questions` violation rate from Phase A measurement changed — still requires multiple real sessions before it means anything, same reasoning as before

---

**Confirm the in-person/remote question from §0, and this kit is ready to use.**
