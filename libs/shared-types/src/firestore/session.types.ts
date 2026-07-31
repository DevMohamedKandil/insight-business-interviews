/** Firestore schema types for `sessions` and its `messages` subcollection. See docs/05-firestore-collections.md §2 and §9A (ADR-0012 resume amendment). */

import type { EvidenceType } from './project.types';

export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type AbandonReason = 'spend_cap' | 'idle_timeout' | 'respondent_left' | null;

/**
 * Document 24 (Evidence Model) — Layer 5. Six states, categorical (never a
 * scalar/percentage — same reasoning as `HypothesisConfidence`, ADR-0017).
 * `verified` is reserved for the (not-yet-built) Document 22 §5 respondent
 * confirmation step — the interview model itself is only ever allowed to report
 * up to `strong` (see openrouter.provider.ts); nothing in this codebase assigns
 * `verified` yet.
 */
export type EvidenceLevel = 'not_started' | 'in_progress' | 'weak' | 'medium' | 'strong' | 'verified';

export interface Session {
  templateId: string;
  templateVersionId: string;
  templateName: string;
  templateSlug: string;
  respondentUid: string;
  status: SessionStatus;
  abandonReason: AbandonReason;
  startedAt: number;
  endedAt: number | null;
  turnCount: number;
  /**
   * ADR-0021 / Document 24 (renamed from `coverageGoalsSatisfied`): current best
   * evidence level per conversation-objective id, monotonically non-decreasing
   * over the session (docs/evidence-level.util.ts) — a later thin answer can
   * never downgrade an objective that already reached `strong`.
   */
  conversationObjectiveEvidence: Record<string, EvidenceLevel>;
  /** Document 23 §6 — the respondent's own words clearly signaled they have
   *  nothing more to add. Sticky once true, same pattern as `abuseFlag`. */
  respondentIndicatedNoMoreToAdd: boolean;
  estimatedCostUsd: number;
  topPainPoint: string | null;
  topUrgency: string | null;
  respondentCountry: string | null;
  respondentOccupation: string | null;
  synthesisReportId: string | null;
  abuseFlag: boolean;
  resumeTokenExpiresAt: number | null;
}

export type MessageRole = 'assistant' | 'respondent';

export type Urgency = 'low' | 'medium' | 'high';
export type BuyingIntent = 'none' | 'low' | 'medium' | 'high';

export interface MessageClassification {
  painPoint: string | null;
  industry: string | null;
  customerSegment: string | null;
  emotion: string | null;
  urgency: Urgency | null;
  buyingIntent: BuyingIntent | null;
  problemFrequency: string | null;
  moneyLostEstimate: number | null;
  timeLostEstimateHours: number | null;
  opportunitySignal: boolean;
  /** The model's OWN certainty that this extraction (painPoint, urgency, etc.) is
   *  correct — an ML classification-confidence score, not a business claim. This
   *  is a different concept from `HypothesisConfidence` (project.types.ts), which
   *  is never model-invented (ADR-0017) — do not conflate the two. */
  confidenceScore: number;
  /** ADR-0018 — tags this message as supporting/contradicting/neutral evidence for
   *  whichever project hypotheses were active this turn. Empty for sessions whose
   *  template has no project (e.g. hand-authored templates). */
  hypothesisEvidence: Array<{ hypothesisId: string; evidenceType: EvidenceType; excerpt: string }>;
}

export interface Message {
  role: MessageRole;
  text: string;
  turnIndex: number;
  createdAt: number;
  classification: MessageClassification | null;
}

export interface SessionResumeToken {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
}
