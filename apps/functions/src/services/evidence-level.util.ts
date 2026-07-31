import type { EvidenceLevel } from '@insightai/shared-types';

/**
 * Document 24 — the six-state Evidence Contract ordering. Pure, deterministic,
 * no LLM — same "calculated, never invented" principle as ADR-0017's confidence
 * util. Evidence for a conversation objective is monotonically non-decreasing
 * over a session: a later short/vague answer must never erase an already-strong
 * story told earlier.
 */
const EVIDENCE_LEVEL_ORDER: EvidenceLevel[] = ['not_started', 'in_progress', 'weak', 'medium', 'strong', 'verified'];

export function evidenceLevelRank(level: EvidenceLevel): number {
  return EVIDENCE_LEVEL_ORDER.indexOf(level);
}

/** Merge a newly-reported level with whatever was already known — never regress. */
export function mergeEvidenceLevel(previous: EvidenceLevel | undefined, reported: EvidenceLevel): EvidenceLevel {
  const previousLevel = previous ?? 'not_started';
  return evidenceLevelRank(reported) > evidenceLevelRank(previousLevel) ? reported : previousLevel;
}

/** Document 23 Layer 5 completion rule: every objective at strong-or-above. */
export function isStrongOrVerified(level: EvidenceLevel | undefined): boolean {
  return evidenceLevelRank(level ?? 'not_started') >= evidenceLevelRank('strong');
}
