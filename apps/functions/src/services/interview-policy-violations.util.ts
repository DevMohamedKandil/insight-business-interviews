import type { EvidenceLevel } from '@insightai/shared-types';

/**
 * Document 26, Phase A (Measurement Only) — deterministic, non-LLM checks run
 * AFTER streaming completes, using the same `replyText` the respondent already
 * received. Never blocks, retries, or alters anything the respondent sees —
 * purely produces a number the founder can look at (Document 26 §4 Phase A).
 * Same epistemic posture as `AbuseDetectionService` (Document 6 §5.3): a
 * heuristic, not a guarantee (Document 26 §8, open question 2 — accepted).
 */
export type PolicyViolationTag =
  | 'multiple_questions'
  | 'opens_with_summary'
  | 'premature_solution_talk'
  | 'consecutive_emotional_question';

const SUMMARY_PREAMBLE_PATTERNS: RegExp[] = [
  /^\s*يبدو أن/i,
  /^\s*من الواضح أن/i,
  /^\s*من الجيد أن/i,
  /^\s*أفهم أن/i,
  /^\s*فهمت،/i,
  /^\s*it seems/i,
  /^\s*it'?s clear/i,
  /^\s*i understand/i,
  /^\s*i see that/i,
  /^\s*it sounds like/i,
];

const SOLUTION_KEYWORDS: RegExp[] = [
  /تطبيق/,
  /أداة/,
  /خدمة تساعد/,
  /منصة تساعد/,
  /\bapp\b/i,
  /\btool\b/i,
  /platform that/i,
  /service that could help/i,
];

const EMOTION_KEYWORDS: RegExp[] = [
  /شعرت/,
  /تشعر/,
  /شعورك/,
  /how did that feel/i,
  /how does (that|it) make you feel/i,
];

function isEmotional(text: string): boolean {
  return EMOTION_KEYWORDS.some((p) => p.test(text));
}

/**
 * @param replyText This turn's assistant reply (already streamed to the respondent).
 * @param evidenceMapBeforeThisTurn The session's evidence levels as they stood BEFORE
 *   this turn's own reported evidence was merged in — the reply can only have been
 *   "premature" relative to what was already known when it was generated.
 * @param conversationObjectiveIds All of this template version's conversation objective ids.
 * @param previousAssistantReplyText The immediately preceding assistant message, or
 *   null if this is the first turn — already available in `InterviewService` via the
 *   bounded history fetch, no new persisted field required for Phase A.
 */
export function detectPolicyViolations(
  replyText: string,
  evidenceMapBeforeThisTurn: Record<string, EvidenceLevel>,
  conversationObjectiveIds: string[],
  previousAssistantReplyText: string | null
): PolicyViolationTag[] {
  const violations: PolicyViolationTag[] = [];

  const questionMarkCount = (replyText.match(/[؟?]/g) ?? []).length;
  if (questionMarkCount > 1) violations.push('multiple_questions');

  if (SUMMARY_PREAMBLE_PATTERNS.some((p) => p.test(replyText))) {
    violations.push('opens_with_summary');
  }

  const anyObjectiveBelowStrong = conversationObjectiveIds.some(
    (id) => !['strong', 'verified'].includes(evidenceMapBeforeThisTurn[id] ?? 'not_started')
  );
  if (anyObjectiveBelowStrong && SOLUTION_KEYWORDS.some((p) => p.test(replyText))) {
    violations.push('premature_solution_talk');
  }

  if (isEmotional(replyText) && previousAssistantReplyText && isEmotional(previousAssistantReplyText)) {
    violations.push('consecutive_emotional_question');
  }

  return violations;
}
