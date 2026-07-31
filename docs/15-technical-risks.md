# InsightAI — Technical Risks

**Document 15 of 20**
**Depends on:** All prior documents (this is a cross-cutting risk review of the whole design)
**Status:** Draft for approval
**Companion:** [00-assumptions-register.md](./00-assumptions-register.md) — many risks below are the "impact if false" column of a specific assumption, made explicit here as a risk with likelihood/mitigation rather than just a caveat

---

## 1. Risk Register

Scored qualitatively (Low/Medium/High) on Likelihood × Impact, per pre-launch v1 conditions (Assumption A3: low volume). Scores are expected to shift as real usage data arrives — this register is a living document, not a one-time exercise.

| # | Risk | Likelihood | Impact | Mitigation | Related |
|---|---|---|---|---|---|
| R1 | Unmetered LLM spend from scripted/bot traffic against a public URL | Medium | High | App Check enforced + per-session/per-template/global spend caps (Document 6 §3-4) | A5, A10 |
| R2 | Prompt injection causes the AI to break character, leak the system prompt, or generate off-brand/harmful content | Medium | Medium | Multi-layered defense (Document 6 §5); accepted as never fully solved, only bounded | — |
| R3 | A single AI provider (chosen for MVP, Document 14 §2) has an outage, rate-limit incident, or pricing change during the MVP window | Low-Medium | Medium | Provider abstraction (Architecture §4) means a same-day fallback to a second provider is a config change once at least one alternate implementation exists — **this is currently a Phase 2 deliverable, so during Phase 1/MVP specifically, a single-provider outage has no automatic failover.** Flagged explicitly as an MVP-window gap, not a solved problem | Document 12 §3-4 |
| R4 | Firestore write-rate limits on hot documents (e.g., a single popular template's `analyticsRollups` doc during a traffic spike) | Low at MVP scale, rising with volume | Medium | Document 4/5's per-template-per-day sharded-by-date rollup keys already avoid a single ever-growing hot document; if a single day/template combination itself becomes hot, Document 17 defines the sharded-counter escalation path | A4, Document 17 |
| R5 | Synthesis output (persona, pain analysis, etc.) contains AI hallucination presented as if directly derived from respondent data | Medium | Medium-High (this is a data-integrity risk to the product's actual value proposition, not just a bug) | Every synthesis field remains traceable to source: exact quotes (FR-21) are literal extracts, not paraphrased, and the Admin Panel's session detail view (Document 8 §8) always shows the raw transcript alongside generated synthesis so the operator can spot-check — the product deliberately never hides the source data behind the AI's summary | Document 14 §4 |
| R6 | Bus factor of one — the founder is the sole engineer, sole admin, sole holder of architectural context | High (structurally true today) | High if realized | This entire 20-document series exists specifically to mitigate this — a second engineer joining reads Documents 1-20 rather than relying on tribal knowledge. Genuinely mitigated only by the documentation existing and staying current, not by any code change | — |
| R7 | App Check false-positive rate meaningfully suppresses legitimate respondent completion | Low-Medium | Medium | Explicit dashboard metric for App Check rejections (Document 6 §3) from day one — turns an invisible risk into a monitored, tunable one | A5 |
| R8 | Secret leakage (AI provider API keys) via misconfiguration, logging, or a compromised dependency | Low | High | Secret Manager only, never Firestore/env-committed (Document 6 §8); dependency review as part of Document 19's CI pipeline | Document 6 §8 |
| R9 | A respondent discloses sensitive PII beyond what pattern-based masking catches (Assumption A9) | Medium | Low-Medium (respondent-level privacy concern, not a business-critical failure at current single-operator/internal-tool scope) | Documented limitation, not a false promise of complete masking; manual review process if a specific disclosure is flagged | A9 |
| R10 | The check-then-call spend-cap race condition (Document 6 §4.3) causes a real overshoot under unexpectedly concurrent traffic | Low at MVP scale | Low-Medium | Global spend cap (Document 5 §8) is a second, independent ceiling even if a per-template race slips through | A10 |
| R11 | Vendor SDK/API breaking changes (OpenAI/Claude/Gemini evolving their structured-output mechanisms) | Medium over time | Low-Medium | Isolated entirely within each `IAIProvider` implementation (Architecture §4) — a breaking vendor change is a one-file fix, never a cross-cutting refactor, *if* the abstraction boundary is respected in practice (a discipline risk, not just a design one) | Document 3 §4 |
| R12 | Cold-start latency on `sendMessage` (Document 10 §1's `minInstances: 0` choice) becomes user-visible/annoying at real traffic patterns | Low-Medium | Low (UX annoyance, not a correctness or cost failure) | Explicit, narrow revisit trigger already documented (Document 10 §1) — `minInstances: 1` on that one function specifically, not a blanket policy change | Document 10 §1 |

## 2. Risks Explicitly Accepted, Not Mitigated Further (and Why)

Some risks above are deliberately left at their current mitigation level rather than pursued to zero — over-mitigating a low-probability, low/medium-impact risk at MVP stage is itself a cost (engineering time not spent validating the product thesis, which is the actual current bottleneck per Document 14 §5).

- **R3 (single-provider outage during MVP window):** accepted because building full multi-provider failover before validating the product with real respondents would be solving a problem (provider reliability at scale) before the problem worth solving (does the interview format work at all) is answered.
- **R9 (imperfect PII masking):** accepted per Assumption A9 — a perfect solution doesn't exist even at large scale, so partial mitigation plus honesty about the limit is the correct engineering posture, not a gap to be embarrassed about.
- **R10 (spend-cap race):** accepted per Assumption A10, with the global cap as a backstop.

## 3. Risks Requiring Action Before Phase 3 Sign-Off (Document 12 §5 / Document 13 §5)

Cross-referencing Document 13's Phase 3 sprints, the following risks must show *measured* (not just designed) mitigation before broad sharing:

- R1 — real adversarial testing (S3.1) against actual App Check + rate limits, not just code review of the logic.
- R2 — real prompt-injection attempts logged and reviewed (S3.1).
- R5 — spot-check a meaningful sample of synthesis reports against their source transcripts for hallucination rate (new activity, added to S3.2's scope).
- R7 — review real App Check rejection counts from Phase 1-2 usage (S3.2).

---

**Approval needed:** Confirm this risk register before Document 16 (Cost Estimation) quantifies R1/R3-adjacent cost exposure in dollar terms.
