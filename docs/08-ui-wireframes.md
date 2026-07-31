# InsightAI — UI Wireframes

**Document 8 of 20**
**Depends on:** [02-prd.md](./02-prd.md) §3.2/§3.6, [07-folder-structure.md](./07-folder-structure.md)
**Status:** Draft for approval

---

## 1. Design Principles Driving Every Screen Below

1. **Mobile-first for the public interview surface** (PRD FR-12) — most respondents arrive from a shared social/WhatsApp link on a phone. The interview layout is designed at a 375px width baseline and scales up, not the reverse.
2. **Never look like a form.** No numbered questions, no progress bar with a literal fraction, no "Question 4 of 12" (PRD FR-10, Vision §8.5). The progress indicator is a soft, ambiguous visual (a gently filling dot trail), not a countdown — because a countdown implicitly promises an exact remaining count the dynamic engine (Architecture §5) cannot honestly give.
3. **Admin Panel prioritizes information density over visual polish** — it's a single-operator tool (Assumption A1), used by someone who wants answers fast, not a marketing-facing dashboard. Angular Material's default density is used as-is; no custom design system investment for v1 (matches the "don't over-invest before proving the product" theme running through every document so far).

## 2. Public Interview — Entry State

```
┌─────────────────────────────────────┐
│  ●●●○○○○○○○            InsightAI    │  ← soft progress dots, no numbers/fraction
│─────────────────────────────────────│
│                                       │
│   🤖  Hi! I'd love to understand     │
│       what it's like managing your   │
│       clinic's patient no-shows.     │
│       Got 3 minutes to chat?         │
│                                       │
│                          Sure! ✅   │  ← respondent's own bubble, right-aligned
│                                       │
│   🤖  Awesome. Tell me about the     │
│       last time a patient just       │
│       didn't show up — what          │
│       happened?                      │
│                                       │
│   🤖 ● ● ●   (typing indicator)     │
│                                       │
│─────────────────────────────────────│
│  [ Type your message...        ] ➤  │
└─────────────────────────────────────┘
```

- **Component mapping:** `interview-shell` resolves `{templateSlug}` → renders `chat` component. Bubbles use Angular Material's `mat-card`-less custom bubble component (a full `mat-card` per message is visually too heavy for a chat surface — deliberate deviation from "use Material defaults everywhere," justified because chat bubble density is a core UX requirement, not a cosmetic preference).
- **Typing indicator (FR-8):** shown for a deliberately calibrated minimum delay (e.g., 600–1200ms randomized) even if the AI response is already available, so the pacing feels conversational rather than instantaneous-and-robotic. **Rationale:** an instant response reads as "obviously a bot," which undermines Vision §2's core differentiation claim ("feel they are chatting with a real person").
- **Streaming (FR-9):** once the delay elapses, text renders progressively as it streams from the HTTPS function (Architecture §6), not as one block appearing at once.

## 3. Public Interview — Closing State

```
┌─────────────────────────────────────┐
│  ●●●●●●●●●●            InsightAI    │  ← dots fully filled, not "12/12"
│─────────────────────────────────────│
│   🤖  This was really helpful —      │
│       thank you for being so         │
│       open about the no-show         │
│       situation. That's exactly      │
│       the kind of detail we          │
│       needed. 🙏                     │
│                                       │
│       Have a great day!              │
│─────────────────────────────────────│
│         [ input disabled ]           │
└─────────────────────────────────────┘
```

- Closing message is config, not code (PRD requirement, template field `closingMessage`, Document 5 §1).
- No "thank you for your submission" survey-style language — deliberately conversational sign-off, reinforcing principle #2 above.

## 4. Public Interview — Unavailable Template State (FR-6)

```
┌─────────────────────────────────────┐
│              InsightAI              │
│─────────────────────────────────────│
│                                       │
│         🌙  This conversation        │
│         isn't available right now.   │
│                                       │
│         Check back later, or         │
│         reach out to whoever         │
│         shared this link with you.   │
│                                       │
└─────────────────────────────────────┘
```

Deliberately vague rather than exposing *why* (paused vs. archived vs. unknown slug) — distinguishing these to an anonymous visitor leaks operator-side information (e.g., confirms a slug exists but is paused) for no respondent benefit.

## 5. Admin — Login (Document 6 §6)

```
┌─────────────────────────────────────┐
│           InsightAI Admin            │
│─────────────────────────────────────│
│                                       │
│   Email     [_______________]        │
│   Password  [_______________]        │
│                                       │
│            [   Sign In   ]           │
│                                       │
└─────────────────────────────────────┘
```

Standard Angular Material form. No "sign up" link exists anywhere in the UI — admin accounts are provisioned only via the privileged Cloud Function (Document 6 §6), never self-service, consistent with single-operator scope (Assumption A1).

## 6. Admin — Dashboard (PRD FR-24/FR-25)

```
┌───────────────────────────────────────────────────────────────┐
│ InsightAI Admin        [Template: Doctors ▾] [Last 30 days ▾] │
│ Dashboard | Templates | Sessions | Analytics          [Logout] │
│─────────────────────────────────────────────────────────────── │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │
│ │Interviews │ │Completion │ │Avg Pain   │ │Avg WTP    │        │
│ │Today: 14  │ │Rate: 68%  │ │Score: 7.2 │ │$41/mo     │        │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘        │
│                                                                  │
│ ┌───────────────────────────┐  ┌─────────────────────────────┐ │
│ │ Top Pain Points (bar)      │  │ Interviews Over Time (line) │ │
│ │ ▇▇▇▇▇▇▇ No-shows           │  │        ╱╲    ╱╲╲            │ │
│ │ ▇▇▇▇▇ Billing delays       │  │      ╱╱  ╲╲╱╱  ╲╲           │ │
│ │ ▇▇▇ Staff scheduling       │  │    ╱╱              ╲╲       │ │
│ └───────────────────────────┘  └─────────────────────────────┘ │
│                                                                  │
│ ┌───────────────────────────┐  ┌─────────────────────────────┐ │
│ │ Top Countries (bar/map)    │  │ Top Occupations (bar)       │ │
│ └───────────────────────────┘  └─────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI Insight Summary (generated text, refreshed daily)         │ │
│ │ "This week, no-show frequency correlates strongly with       │ │
│ │  clinics that don't send SMS reminders. 6 respondents         │ │
│ │  independently described losing 2-4 hours/week..."            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                          [Export CSV] [Export PDF]│
└───────────────────────────────────────────────────────────────┘
```

- All values shown read from `analyticsRollups` documents (Document 5 §6) — bounded reads, fast regardless of historical volume, per Document 4 §4's whole rationale.
- Chart library and exact color/accessibility treatment deferred to implementation (per the project's `dataviz` design conventions at build time) — this document specifies *content and layout*, not pixel-level chart styling.
- **Flagged/abuse-excluded sessions (Document 6 §5) are not silently missing** — a small "3 sessions excluded (flagged)" caption appears near the date-range selector, linking to the flagged-sessions filter, so the operator never wonders why numbers don't match a manual spot-check.

## 7. Admin — Template Editor (PRD §3.1)

```
┌───────────────────────────────────────────────────────────────┐
│ ← Templates       Editing: "Doctors"              [Save Draft] │
│─────────────────────────────────────────────────────────────── │
│ Name          [ Doctors                              ]         │
│ Slug          [ doctors                               ]  🔒 once live │
│ Description   [ ...                                   ]         │
│ Target Aud.   [ ...                                   ]         │
│                                                                  │
│ ── Conversation ──                                              │
│ Prompt              [ multi-line textarea            ]         │
│ Conversation Rules  [ multi-line textarea (JTBD, Mom  ]         │
│                      [ Test, Five Whys framing)       ]         │
│ Coverage Goals      [+ Add goal]                                 │
│   • Identify current no-show workaround           [x]           │
│   • Estimate time/money lost                       [x]           │
│                                                                  │
│ ── AI Configuration ──                                          │
│ Provider      [ OpenAI ▾ ]   Temperature [ 0.8 ]                │
│ Max Tokens    [ 400 ]        Max Turns   [ 14 ]                 │
│ Daily Spend Cap (USD) [ 5.00 ]  ⚠ required to publish            │
│                                                                  │
│ ── Messaging ──                                                 │
│ Welcome Message [ ... ]      Closing Message [ ... ]            │
│ Language        [ English ▾ ]                                    │
│                                                                  │
│ Status: Draft            [ Publish (validates required fields) ] │
└───────────────────────────────────────────────────────────────┘
```

- The "Publish" action runs the exact FR-3 validation (slug, prompt, provider, spend cap all present) client-side *and* server-side in the `publishTemplate` Cloud Function — client-side validation is a UX convenience, never the actual security/integrity boundary (consistent with Document 6's entire philosophy that the client is never trusted for anything that matters).
- Publishing creates a new immutable version (Document 5 §1.1) — the editor visually indicates "Publishing will create version 3" so the operator understands the versioning model rather than being surprised by it later.

## 8. Admin — Session Detail (PRD FR-26)

```
┌───────────────────────────────────────────────────────────────┐
│ ← Sessions      Session #a8f2...     Status: Completed          │
│─────────────────────────────────────────────────────────────── │
│ Started: 2026-07-30 14:02   Duration: 4m12s   Turns: 9           │
│ Country: Egypt   Occupation: Doctor   Cost: $0.014               │
│                                                                  │
│ [ Transcript ]  [ Classification ]  [ Synthesis Report ]         │
│─────────────────────────────────────────────────────────────── │
│  (Transcript tab shown)                                          │
│  🤖 Hi! I'd love to understand...                                │
│     Sure!                                                        │
│  🤖 Tell me about the last time...                               │
│     Last week a patient just didn't come, no call, nothing...    │
│     [pain: no-show | urgency: medium | confidence: 0.81]         │
│  ...                                                              │
└───────────────────────────────────────────────────────────────┘
```

Tabs map directly to the three Firestore reads a session detail view needs: `messages` subcollection, the same subcollection's `classification` maps rendered inline, and the linked `synthesisReports/{sessionId}` document (Document 5 §3) — no additional aggregation, straightforward document fetches.

## 9. Responsive Behavior Summary

| Breakpoint | Public Interview | Admin Panel |
|---|---|---|
| < 600px (primary target) | Full-width single column, as drawn above | Sidebar collapses to a top hamburger menu; stat tiles stack 2-per-row |
| 600–1024px | Chat centers with max-width ~480px, decorative margins | Sidebar visible; stat tiles 4-per-row as drawn |
| > 1024px | Same as tablet, centered | Full layout as drawn, charts side-by-side |

---

**Approval needed:** Confirm these flows/screens before Document 9 (API Design) specifies the exact request/response contracts each of these UI actions calls.
