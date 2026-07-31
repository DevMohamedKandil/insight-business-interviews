/** Document 6 §5, layer 3 — an independent heuristic check that runs regardless of
 *  what the model itself self-reports (`selfReportedInjectionAttempt`), because a
 *  sufficiently clever injection could suppress the model's own self-report. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|above|prior) instructions?/i,
  /you are now/i,
  /system prompt/i,
  /reveal (your |the )?(instructions?|prompt)/i,
  /disregard (all |the )?(previous|above|prior)/i,
  /act as (if you|a) /i,
  /new instructions?:/i,
];

export class AbuseDetectionService {
  /** Never blocks — only flags. Blocking outright would tip off an attacker exactly
   *  which heuristic tripped (Document 9 §2.2 step 4). */
  scan(text: string): { heuristicFlag: boolean } {
    return { heuristicFlag: INJECTION_PATTERNS.some((pattern) => pattern.test(text)) };
  }
}
