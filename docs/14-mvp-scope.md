# InsightAI — MVP Scope

**Document 14 of 20**
**Depends on:** [12-development-roadmap.md](./12-development-roadmap.md), [13-sprint-plan.md](./13-sprint-plan.md)
**Status:** Draft for approval

---

## 1. Purpose of This Document

Documents 12-13 sequence *how* work happens across phases; this document draws the precise line of **what ships as "v1" for the purpose of calling the product real and usable** — the end of Phase 1 plus the parts of Phase 2 that are load-bearing, not cosmetic. This distinction matters because "MVP" is often used loosely; here it is a specific, checkable list.

## 2. MVP = In Scope

| Capability | Included Because |
|---|---|
| One live template, operator-configured (prompt, coverage goals, provider, temperature, spend cap, language, messages) | The entire product thesis (adaptive AI interview vs. static survey) is unverifiable without this |
| Single AI provider wired end-to-end (OpenAI — Document 12 §3's default) | Proves the core loop; multi-provider swap is a Phase 2 concern, not required to validate the product itself |
| Public interview flow: anonymous entry, one-question-at-a-time, streaming, typing pacing, bounded coverage-goal-driven termination | This *is* the product's differentiator (Vision §7) — cannot be cut or simplified without losing the thing being tested |
| Per-message classification (pain point, emotion, urgency, etc.) stored per Document 5 §2.1 | Without this, interviews produce only a transcript, which is the exact failure mode (manual analysis) the product exists to remove (Vision §2) |
| Basic synthesis report per completed session (executive summary, persona, pain analysis, quotes — the highest-value fields; see §4 below for which synthesis fields can lag) | The founder needs *some* structured deliverable to evaluate whether the whole approach works, not just raw data |
| Spend cap enforcement + App Check + rate limiting | Non-negotiable per Vision §13.2 amendment — an MVP that can generate a surprise bill is not a viable MVP regardless of feature completeness |
| Admin auth (real, claim-gated) | Non-negotiable per Document 6 §6 — there is no version of this product where the admin surface is left open |
| Minimal template editor (create/edit/publish one template) | The operator must be able to configure the one MVP template without touching the Firestore console directly, or this isn't a usable product, just a personal script |

## 3. MVP = Explicitly Out of Scope (Deferred to Phase 2+)

| Capability | Why It Can Wait |
|---|---|
| Multiple simultaneous live templates | One template is sufficient to validate the core loop; the *architecture* already supports many (Document 5 §1 has no single-template assumption baked in), so adding more later is configuration, not re-engineering |
| Claude/Gemini provider implementations | The abstraction (Architecture §4) is proven by having exactly one clean implementation behind it; a second/third implementation proves the *swap*, which is a distinct, later milestone (Document 12 §4) |
| Full Admin Dashboard (charts, top-N breakdowns, CSV/PDF export) | The founder can read a handful of `synthesisReports` documents directly during MVP evaluation; a polished dashboard matters once there's enough volume that reading documents one-by-one stops scaling — that's a Phase 2 problem by definition |
| Template versioning UI polish | The versioning *mechanism* (Document 5 §1.1) must exist from S1.2 (data integrity requirement), but a nice "publishing creates version 3" UI affordance is cosmetic and deferred |
| Session search/filter | Same reasoning as the dashboard — matters at volume, not at MVP's single-template validation scale |

## 4. A Note on Synthesis Report Completeness Within MVP

PRD FR-21 lists fourteen distinct synthesis fields (executive summary through exact quotes). **Decision:** MVP's synthesis prompt generates all fourteen fields in one call (they're cheap to include once the call is being made at all — the *marginal* cost of a few more output fields in the same structured-output call is small compared to the cost of the call itself), but **only four are held to a quality bar that gates MVP sign-off**: executive summary, persona, pain analysis, and exact quotes. The remaining ten (JTBD breakdown, customer journey, recommended pricing, etc.) ship and are visible, but their prose quality is explicitly allowed to be rough at MVP exit — refining prompt engineering for all fourteen simultaneously before ever seeing real respondent data would be optimizing blind. **Rationale:** this is a "ship all fields, but don't gate launch on all fields being polished" split, not a "cut fields" split — nothing is hidden or missing, some fields are just allowed to still be rough.

## 5. MVP Success Criteria (Ties to Vision §9's North Star)

MVP is considered validated, not just "shipped," when:

1. At least 10 real (non-founder-test) respondents have completed the interview end-to-end.
2. At least 3 of those sessions produced a pain point the founder considers genuinely new information (not something already assumed going in) — this is the actual test of whether the adaptive-interview thesis holds, not just whether the software runs.
3. Zero unplanned spend-cap incidents (i.e., the cap mechanism is never the *reason* a real respondent's interview cut short — if it triggers, it should be because of abuse/bot traffic, which is what it's for, not because a normal template's cap was set too low).

---

**Approval needed:** Confirm this scope line before Document 15 (Technical Risks) assesses what could go wrong specifically within this MVP boundary.
