# InsightAI — Production Checklist

**Document 20 of 20**
**Depends on:** All prior documents — this is the final gate before Phase 3 sign-off (Document 12 §5, Document 13 §5)
**Status:** Draft for approval

---

## 1. How to Use This Document

Each item cites the specific document/section it enforces and states a **verification action** — something you actually do and observe, not just a restated requirement to trust. An item is only checked off once the verification action has been performed against `insightai-prod` (Document 19 §1), not merely implemented in code. This checklist is the concrete, checkable form of Document 12 §5's "Phase 3 exit criterion."

## 2. Cost Control (the risk this entire series treats as existential, per Vision §13.2)

- [ ] `insightai-prod` is on the Blaze plan (Document 3 ADR, Document 16 §1) — verified in Firebase Console billing settings, not assumed.
- [ ] Every `live` template has a non-empty, deliberately-chosen `dailySpendCapUsd` (Document 5 §1, PRD FR-3) — spot-checked by listing all `live` templates and confirming none rely on a default/placeholder value.
- [ ] `configurations/global.globalDailySpendCapUsd` is set (Document 5 §8, Document 16 §4).
- [ ] Cloud Functions `maxInstances` caps are deployed as configured (Document 10 §1), not left at platform defaults — verified in the Cloud Functions console per function.
- [ ] The spend-guard short-circuit path has been manually triggered at least once against a real (bounded) test — i.e., someone has actually watched a session get gracefully abandoned with `abandonReason: 'spend_cap'` (Document 6 §4), not just read the code that's supposed to do this.
- [ ] Billing alert configured at the Google Cloud project level as a human-notification backstop independent of the application-level caps (defense in depth, per Document 6 §4's "second layer" philosophy) — this specific alert is not mentioned elsewhere in this series and is added here because a checklist's job is partly to catch gaps the design documents didn't individually call out.

## 3. Security (Document 6)

- [ ] Firestore Security Rules deployed to `insightai-prod` match the tested rules from `firestore.rules` in source control (Document 19 §5) — verified by comparing the deployed rules' hash/timestamp against the last CI-tested commit, not by re-reading the file.
- [ ] The single most important rules test (Document 18 §4 — direct client write to `sessions`/`messages` denied) has been re-verified against the **deployed prod rules specifically**, not only the emulator in CI.
- [ ] App Check is in **enforced** mode (not monitor-only) on both the Angular app and every AI-provider-calling function (Document 6 §3) — verified in the App Check console, per-service enforcement status.
- [ ] Admin custom claim (`admin: true`) is granted to exactly the intended account(s) — verified by listing all accounts with the claim, confirming no unexpected grants.
- [ ] `/admin` route requires real auth in the deployed app (not a build artifact that accidentally shipped a debug bypass) — verified by attempting to load `/admin` in an incognito/unauthenticated browser session against the prod URL.
- [ ] AI provider API keys are confirmed present only in Secret Manager, absent from any Firestore document, environment variable committed to source, or client-reachable bundle (Document 6 §8) — verified by grepping the built client bundle for key-shaped strings as a final sanity check.
- [ ] Sensitive-data masking (Document 6 §7) verified against at least one real test message containing a phone number/email, confirming the masked placeholder (not the raw value) is what's persisted.

## 4. Data Integrity & Backup (Flagged Open in Document 19 §6 — Resolved Here)

- [ ] **Decision made and recorded:** at minimum, a scheduled Firestore export (Google Cloud's native `gcloud firestore export` on a Cloud Scheduler-triggered function, or manual periodic export) to a Storage bucket is configured before broad sharing — Document 19 explicitly deferred this decision to this checklist rather than silently assuming it's handled; it must not remain unresolved past this gate.
- [ ] Synthesis idempotency (Document 5 §3's `create()`-only mechanism) verified against prod by deliberately re-triggering a completed session's synthesis path and confirming no duplicate `synthesisReports` document is created.
- [ ] `onSynthesisRequested` retry/failure handling (Document 10 §5) verified by simulating a provider failure (e.g., temporarily invalid key in dev, not prod) and confirming `status: 'failed'` after exhausted retries rather than a session stuck in `pending` indefinitely.

## 5. Respondent Experience (Documents 8, 11)

- [ ] Full public interview flow completed end-to-end on an actual mobile device (not just desktop browser resize) against `insightai-prod` (Document 8 §1's mobile-first principle) by someone other than the person who built it, per Document 18 §7's point that quality review benefits from a perspective beyond the implementer's own assumptions.
- [ ] Unavailable-template state (Document 8 §4) verified for a real `paused` template — confirms no information leak about *why* it's unavailable.
- [ ] Streaming renders correctly on the deployed prod HTTPS function (Document 9 §2.2) — a preview-channel or dev-project test of streaming is not sufficient, since HTTPS streaming behavior can differ from Callable Functions in ways specific to the real deployed endpoint.

## 6. Observability (PRD NFR-Observability, Document 5 §9)

- [ ] `auditLogs` collection confirmed populating in prod for both `llm_call` and `admin_action` types — verified by performing one of each action and confirming the corresponding log document appears.
- [ ] Admin Dashboard's "App Check rejection count" metric (Document 6 §3, Assumption A5) is visible and reads a real (even if zero) number, not a placeholder — this is the specific mitigation for A5's accepted false-positive risk, and it only functions as a mitigation if someone will actually look at it, which requires it to exist and be wired to real data first.
- [ ] Flagged/abuse-excluded session count caption (Document 8 §6) confirmed visible on the dashboard.

## 7. Operational Readiness

- [ ] Rollback procedure (Document 19 §6) has been **rehearsed at least once** against `insightai-dev` — i.e., someone has actually run `firebase hosting:rollback` and redeployed a tagged prior Functions build, not just read that the mechanism exists. A rollback procedure that has never been executed is unverified, not ready.
- [ ] At least one prod deployment has been tagged (Document 19 §6) so "redeploy last known-good" has a concrete target.
- [ ] MVP success criteria (Document 14 §5) — 10+ real completed interviews, at least 3 yielding genuinely new information, zero unplanned spend-cap incidents — are met, or explicitly re-evaluated if not, before considering broad sharing "launched."

## 8. Sign-Off

This checklist is complete when every box above is checked **against `insightai-prod`**, not against dev/staging, and not from memory of "we built that." Per Document 12 §5, this is the Phase 3 exit criterion: a template link can be shared broadly without the founder needing to babysit it — and this document is the specific, falsifiable definition of what "not needing to babysit it" means.

---

## 9. Series Closing Note

This completes the 20-document planning series requested at the start of this engagement. Every architectural, product, security, and process decision made across these documents is traceable to either an explicit requirement, a stated rationale with alternatives considered, or a logged assumption in [00-assumptions-register.md](./00-assumptions-register.md) — per the standing instruction to write this as permanent company knowledge, not implementation notes. No code has been written; per the agreed process, code generation begins module-by-module only after these documents are approved.
