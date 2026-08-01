# InsightAI — Validation Sprint Policy (Sprint 1 vs. Sprint 2)

**Document 28 of the series**
**Status:** Founder-confirmed policy. Canonical source for this split — Documents 19, 20, 21, and 27 are updated to reference this document rather than restate it.
**No code, prompt, or architecture changes.** This is a sequencing/scope decision only.

---

## 1. The Policy, Stated Once, Referenced Everywhere Else

| | Validation Sprint 1 (current) | Validation Sprint 2 (future) |
|---|---|---|
| Participants | Face-to-face only | Remote |
| Environment | `localhost`, emulator only | Production deployment |
| Access | Observer (you) physically present, on your laptop | Public URL, no observer required |
| Firebase | Emulator Suite only | Real Firebase project, Blaze plan |
| Deployment | None — explicitly not done | Full Document 19 deployment executed |

## 2. Rationale (Founder's Own Reasoning, Recorded)

The current objective is validating interview quality and customer behavior — not infrastructure. Deployment, Firebase production, hosting, and remote access are all real, working, and fully designed (Documents 3-20 cover them in depth) — none of that is blocked or in question. They are **deliberately postponed**, not because they aren't ready, but because doing them now would spend effort on a question (`does the system deploy correctly?`) that isn't the current bottleneck, ahead of the question that is (`does a real conversation with a real stranger produce real evidence?`). This is the same measure-before-build discipline this project has applied throughout (ADR-0017's confidence rule, Document 25/26's A/B-test-before-redesign sequencing) — applied here to sequencing, not just to individual features.

## 3. Sprint 1 → Sprint 2 Transition

**Trigger to *review* (not to automatically switch):** 5 completed face-to-face interviews (Document 27 §7 — "completed" includes both successful and failed interviews per that document's definitions; a failed interview is still real data, not a discard).

**What happens at that trigger:** produce the 5-person Validation Report exactly as specified in Document 21 §8 (Patterns / Repeated Problems / Evidence / Unexpected Opportunities / Product Improvements / New Hypotheses). **The move to Sprint 2 is then a founder decision informed by that report — not an automatic switch at exactly interview #5.** If the 5-person report reveals the interview itself is fundamentally not working (e.g., a majority of "failed" outcomes per Document 27 §7), the right move is to stay in Sprint 1 (more face-to-face interviews, or a scoped fix if a Critical blocker was found) rather than deploy a product not yet shown to work face-to-face.

## 4. Explicitly Frozen During Sprint 1

- Document 19's deployment steps (any of them — dev or prod)
- Document 20's Production Checklist execution (the checklist itself remains valid and unchanged; it simply isn't run yet)
- `firebase login`, real project creation, Blaze billing setup
- App Check enforcement in a real (non-emulator) context
- Any public URL, domain, or hosting configuration

## 5. Explicitly Still Active During Sprint 1 (Not Paused)

- Document 26 Phase A (policy-violation measurement) — requires no deployment, keeps accumulating real data with every face-to-face interview at zero additional effort
- Document 21's Founder Journal and 5-person Validation Report cadence
- Document 27's checklists, moderator script, and templates, exactly as written for the confirmed face-to-face/localhost mode

## 6. Cross-Reference Updates

| Document | Change |
|---|---|
| [27 — First External Validation Kit](./27-first-external-validation-kit.md) | §0's conditional blocker resolved — see that document's updated status line |
| [21 — Validation Protocol](./21-validation-protocol.md) | Scope note added: assumes Sprint 1's face-to-face mode per this policy |
| [19 — Deployment Strategy](./19-deployment-strategy.md) | Status note added: execution deferred to Sprint 2 per this policy, design unchanged |
| [20 — Production Checklist](./20-production-checklist.md) | Status note added: execution deferred to Sprint 2 per this policy, checklist unchanged |

---

**Sprint 1 is confirmed ready to begin under this policy.**
