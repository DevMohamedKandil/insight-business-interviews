# InsightAI — Vision Document

**Document 1 of 20 — Development Approach Series**
**Status:** Draft for approval
**Owner:** Principal Architecture (Claude) + Mohamed Kandil (Founder)

---

## 1. Executive Summary

InsightAI is an AI-powered conversational research platform that replaces static surveys with adaptive, human-like interviews. Instead of forcing respondents through fixed multiple-choice or Likert-scale forms, InsightAI has a real-time conversation with each respondent — one question at a time, adapting the next question to the previous answer — and extracts structured, decision-grade insight (pain points, willingness to pay, urgency, emotion, opportunities) from natural language.

The end product for the founder/operator is not "a chat log." It's a live dashboard of validated customer problems, ranked opportunities, and exact quotes — the raw material of customer discovery, generated at a scale and speed no human research team can match.

## 2. The Problem

Traditional research tools (Typeform, Google Forms, SurveyMonkey) share the same failure mode:

- Respondents answer what's asked, not what's true. Fixed questions can't follow up on a surprising answer.
- Completion collapses as question count rises — there's a hard tradeoff between depth and completion rate.
- Analysis is manual. Someone still has to read every response and manually tag themes, quotes, and personas.
- They were built for measurement, not discovery. They're bad at the open-ended "tell me about the last time..." style questioning that actually surfaces unmet needs (Jobs To Be Done, The Mom Test, Five Whys).

The result: founders and product teams either skip real customer discovery (and guess), or spend weeks doing 1:1 interviews manually, which doesn't scale past a handful of conversations.

## 3. The Vision

**A world where any founder, product team, or business can have a genuine, adaptive discovery conversation with thousands of customers simultaneously — at zero marginal cost — and receive the same caliber of insight a trained researcher would produce by hand.**

InsightAI is the interviewer. It never gets tired, never leads the witness, never forgets what was said three messages ago, and never stops probing until it understands the *why* behind the *what*.

## 4. Mission Statement

Replace the survey with a conversation. Turn every respondent's raw words into structured, actionable business intelligence — automatically, continuously, and at near-zero cost per interview.

## 5. Who This Is For

Two distinct users, both must be served well:

| User | Need |
|---|---|
| **The Operator** (founder, PM, researcher — initially just you) | Create an interview template in minutes, share one URL, watch structured insight accumulate without touching a spreadsheet. |
| **The Respondent** (Egyptian abroad, doctor, property owner, etc.) | A conversation that feels like texting a curious, respectful person — not filling out a form. No login, no friction, no wasted time. |

## 6. Value Proposition

- **For the operator:** Customer discovery as a self-serve, always-on service. Define a template once ("Egyptians Abroad," "Doctors," "SMEs"); get continuously enriched personas, pain rankings, and startup opportunities in return — no manual coding of qualitative data.
- **For the respondent:** A low-friction, respectful, genuinely interesting conversation instead of a form. Anonymous, no signup, mobile-first, feels like a real person is listening.

## 7. Differentiation

| | Traditional Survey Tools | Generic Chatbot | InsightAI |
|---|---|---|---|
| Questions adapt to previous answers | ❌ | Partial | ✅ Always |
| Structured extraction after every message | ❌ (manual) | ❌ | ✅ Automatic |
| Interview methodology built in (JTBD, Mom Test, Five Whys) | ❌ | ❌ | ✅ Core to prompt design |
| Multi-provider AI, swappable via config | N/A | Rare | ✅ Abstracted provider layer |
| Cost per respondent | License fee | Variable | Near-zero (Firebase free tier + cheap LLM tiers) |
| Auto-generated persona/opportunity reports | ❌ | ❌ | ✅ Core deliverable |

## 8. Guiding Principles (non-negotiable constraints for every later document)

1. **Free-tier first.** Every architectural decision for v1 must default to something that runs, in production, inside Firebase's Spark/Blaze free-tier limits and the cheapest viable LLM tier. Paid infrastructure is opt-in scale-up, never a v1 requirement.
2. **Provider-agnostic AI.** No business logic anywhere may assume a specific AI vendor. Provider choice is configuration, not code.
3. **Config over code.** Interview behavior, prompts, scoring, and messaging are data (Firestore documents), never hardcoded strings in the frontend.
4. **Modular from day one.** Repository pattern, service layers, and dependency injection are used even in the MVP — not retrofitted later — because "hundreds of thousands of users" is the design target, not a stretch goal.
5. **Respondent experience is sacred.** No feature ships if it makes the conversation feel like a form. One question at a time, human pacing, no dead ends.
6. **Every conversation produces structured data.** Unstructured chat logs are a byproduct, not the deliverable. The deliverable is Firestore documents: scores, quotes, personas, opportunities.

## 9. Success Metrics (North Star)

- **Primary North Star:** Number of validated pain points + opportunities extracted per week, at $0 marginal infrastructure cost.
- Supporting metrics (tracked from day one in the Admin Panel — see Document 2):
  - Interview completion rate
  - Average interview depth (messages per session) vs. average duration
  - % of sessions yielding at least one high-confidence pain point
  - Cost per completed interview (target: track toward $0.00)

## 10. Explicit Non-Goals for v1 (deferred, not forgotten)

- Voice interviews, WhatsApp/Telegram/SMS/Email channels — designed for later, not built now (see Future Features roadmap in Document 12).
- User accounts / login for respondents (anonymous auth only, by design, not as a stopgap).
- Multi-language UI polish beyond content being language-configurable per template.
- Payment/monetization of the platform itself (this is an internal research tool first; SaaS packaging is a later strategic decision, not a v1 concern).

## 11. Why Now

LLM inference cost has dropped enough that a full adaptive interview (10–20 conversational turns + per-message classification + end-of-interview synthesis) can run within free or near-free tiers on more than one provider. Firebase's free tier (Firestore, Functions, Hosting, Anonymous Auth) removes all backend hosting cost at this scale. The two things that made this impossible three years ago — conversational AI cost and serverless hosting cost — are both solved. The remaining work is architecture and product design, which is exactly where we're starting.

## 12. What Comes Next

Per the agreed development approach, no code is written until each of the following documents is drafted and approved, in order:

1. ~~Vision Document~~ ← *this document*
2. Product Requirements Document (PRD)
3. Software Architecture Document
4. Database Design
5. Firestore Collections
6. Security Model
7. Folder Structure
8. UI Wireframes
9. API Design
10. Cloud Functions Design
11. Angular Architecture
12. Development Roadmap
13. Sprint Plan
14. MVP Scope
15. Technical Risks
16. Cost Estimation (Firebase Free Tier)
17. Scaling Strategy
18. Testing Strategy
19. Deployment Strategy
20. Production Checklist

---

## 13. Technical Review — Amendments Incorporated

Before proceeding, the following corrections were raised and resolved. These are binding on every later document, not just this one:

1. **"Free" means Blaze plan, architected to stay near $0 — not Spark.** Cloud Functions on the Spark (free) plan cannot make outbound calls to third-party APIs, and every LLM call is one. We are on Blaze from day one; Document 16 will cost-model usage, not claim a hard $0 ceiling.
2. **Abuse/cost protection is a v1 launch requirement, not a backlog item.** Anonymous Auth + a public URL is an open door to an unmetered LLM bill. Firebase App Check, a hard per-session turn cap, and a server-enforced per-template daily spend cap are mandatory before any template goes live.
3. **The interview engine is a bounded state machine with dynamic phrasing, not an unbounded free-form chat.** The AI decides *how* to ask and *what to probe next* dynamically (Mom Test / JTBD / Five Whys), but every interview has defined coverage goals and a hard max-turn/max-token ceiling. This bounds both cost and respondent fatigue.
4. **Reply generation and per-message classification are one structured-output LLM call, not two.** Halves cost and latency versus calling the model twice per turn.
5. **Tenancy scope for v1: single operator.** Only the founder uses the admin panel; there is no customer-facing signup or billing. Data model and security rules are scoped accordingly (see Documents 4–6). Multi-tenancy is an explicit, deliberate future migration (tracked in Document 12), not built speculatively now.

---

**Status: Approved with amendments above.** Proceeding to Document 2 (PRD).
