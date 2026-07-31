import type { HypothesisEvidenceEntry, HypothesisConfidence, HypothesisStatus } from '@insightai/shared-types';

/**
 * ADR-0017. Pure, deterministic, auditable — no LLM involved. Confidence is
 * calculated from a logged evidence trail, never invented. Thresholds are named
 * constants specifically so they're inspectable/tunable, not magic numbers buried
 * in conditionals — a founder (or a future engineer) should be able to read this
 * file and understand exactly why a hypothesis got the status it did.
 */
const MIN_EVIDENCE_FOR_ANY_VERDICT = 3; // fewer than this = too early to say anything but "emerging"
const MIN_EVIDENCE_FOR_VALIDATED = 5; // a strong ratio on a tiny sample isn't "validated" yet
const STRONG_SUPPORT_RATIO = 0.7;
const STRONG_CONTRADICT_RATIO = 0.3; // support ratio at or below this reads as "contradicted"

export function computeHypothesisConfidence(evidenceLog: HypothesisEvidenceEntry[]): HypothesisConfidence {
  const supportingCount = evidenceLog.filter((e) => e.evidenceType === 'supports').length;
  const contradictingCount = evidenceLog.filter((e) => e.evidenceType === 'contradicts').length;
  const neutralCount = evidenceLog.filter((e) => e.evidenceType === 'neutral').length;
  const totalCount = evidenceLog.length;
  const informativeCount = supportingCount + contradictingCount;

  let status: HypothesisStatus;
  if (informativeCount === 0) {
    status = 'untested';
  } else if (informativeCount < MIN_EVIDENCE_FOR_ANY_VERDICT) {
    status = 'evidence_emerging';
  } else {
    const supportRatio = supportingCount / informativeCount;
    if (supportRatio >= STRONG_SUPPORT_RATIO) {
      status = informativeCount >= MIN_EVIDENCE_FOR_VALIDATED ? 'validated' : 'evidence_emerging';
    } else if (supportRatio <= STRONG_CONTRADICT_RATIO) {
      status = 'contradicted';
    } else {
      status = 'inconclusive';
    }
  }

  const reasoning =
    informativeCount === 0
      ? 'No supporting or contradicting evidence collected yet.'
      : `${supportingCount} supporting, ${contradictingCount} contradicting out of ${totalCount} total ` +
        `pieces of evidence (${neutralCount} neutral) → ${status}.`;

  return { status, supportingCount, contradictingCount, neutralCount, totalCount, reasoning };
}
