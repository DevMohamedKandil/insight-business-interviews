/** Shared contract for the AI Provider Layer. See docs/03-software-architecture.md §4 and docs/adr/ADR-LOG.md ADR-0002/ADR-0011. */

import type { ConversationObjective } from '../firestore/template.types';
import type { MessageClassification, EvidenceLevel } from '../firestore/session.types';
import type { Persona, HypothesisType, HypothesisPriority } from '../firestore/project.types';

export interface ConversationTurn {
  role: 'assistant' | 'respondent';
  text: string;
}

export interface ActiveHypothesis {
  id: string;
  text: string;
}

export interface InterviewTurnInput {
  /** Fully constructed system prompt: base prompt + conversation rules + remaining
   *  conversation objectives + language + anti-injection instructions. Built by
   *  InterviewService, never by the provider (docs/10-cloud-functions-design.md §2 step 5). */
  systemPrompt: string;
  /** Bounded history per the sliding-window rule (docs/10-cloud-functions-design.md §3). */
  history: ConversationTurn[];
  /** ADR-0021: Layer 3 ONLY. Research Objectives (Layer 2) must never appear here —
   *  structurally impossible, since `Project.researchObjectives` has no path into
   *  this type at all (docs/23-prompt-architecture-redesign.md §4). */
  remainingConversationObjectives: ConversationObjective[];
  /** ADR-0018 — empty for sessions with no project. The provider asks the model to
   *  tag each respondent message as supporting/contradicting/neutral evidence for
   *  each of these, in the SAME structured call (never a separate pass). */
  activeHypotheses: ActiveHypothesis[];
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  costEstimateUsd: number;
}

/** One conversation objective's evidence level as judged THIS turn (Document 24).
 *  Only objectives the model has an opinion on this turn are included — omitted
 *  entirely if not relevant, same "don't force it" pattern as `hypothesisEvidence`. */
export interface ObjectiveEvidenceReport {
  id: string;
  /** The model may report up to `strong` only — `verified` is assigned solely by
   *  the (not-yet-built) respondent-confirmation step, never by the interviewer. */
  level: Exclude<EvidenceLevel, 'verified'>;
}

export interface InterviewTurnOutput {
  replyText: string;
  extraction: MessageClassification;
  /** ADR-0021/Document 24 (renamed from `satisfiedGoalIds`, now richer than a
   *  boolean): per-objective evidence level as judged this turn. */
  objectiveEvidence: ObjectiveEvidenceReport[];
  /** Document 23 §6 — the respondent's own words clearly signaled they have
   *  nothing more to add (e.g. "that's really all I can think of"). A specific,
   *  narrow self-report, never a vague "done-ness" score — same pattern as
   *  `selfReportedInjectionAttempt`. */
  respondentIndicatedNoMoreToAdd: boolean;
  /** True if the model itself detected an injection/manipulation attempt in the input
   *  it just processed (docs/06-security-model.md §5, layer 2 — never trusted alone). */
  selfReportedInjectionAttempt: boolean;
  usage: TurnUsage;
}

/** A single streamed chunk, matching docs/09-api-design.md §2.2's wire format. */
export type StreamEvent =
  | { type: 'token'; value: string }
  | { type: 'done'; output: InterviewTurnOutput };

/**
 * ADR-0019 (Idea Intake). Founder-facing, non-streaming — reviewed on screen, not
 * consumed turn-by-turn like a chat, so plain JSON-mode output is the right tool
 * here (unlike ADR-0013's marker-splitting trick, which exists only because the
 * interview turn is respondent-facing and must stream). Deliberately produces NO
 * confidence/percentage field anywhere — every hypothesis is untested by
 * construction (ADR-0017); status is computed later from real evidence, never
 * generated here.
 */
export interface HypothesisDraft {
  text: string;
  type: HypothesisType;
  priority: HypothesisPriority;
  reason: string;
  riskAssumption: string;
}

export interface ProjectDraftGenerationOutput {
  generatedTitle: string;
  description: string;
  category: string;
  businessModelCandidates: string[];
  customerSegments: string[];
  personas: Persona[];
  suggestedLanguage: string;
  successMetrics: string[];
  killCriteria: string[];
  hypotheses: HypothesisDraft[];
  /** ADR-0021, Layer 2: the founder's own study plan. NEVER forwarded to
   *  `TemplateVersion` and NEVER passed to the interview model (docs/23 §4). */
  researchObjectives: string[];
  /** ADR-0021, Layer 3 (renamed from `coverageGoals`): what ONE conversation
   *  should uncover — the only objective type the interview model ever sees. */
  conversationObjectives: ConversationObjective[];
  generatedPrompt: string;
  generatedConversationRules: string;
  /** Written in `suggestedLanguage`, not a hardcoded-English fallback (a real bug
   *  caught in this session's smoke test — see ADR log). */
  welcomeMessage: string;
  closingMessage: string;
  usage: TurnUsage;
}

export interface IAIProvider {
  /** Streams the reply as tokens arrive, then resolves once the full structured
   *  output (reply + classification, ADR-0005) is available. */
  generateInterviewTurnStreaming(
    input: InterviewTurnInput,
    onEvent: (event: StreamEvent) => void
  ): Promise<InterviewTurnOutput>;

  /** ADR-0019 — Idea Intake's single structured-output call. Takes the founder's
   *  plain-language idea description, returns everything needed to populate a
   *  `Project` + its `Hypothesis` docs + a ready-to-approve `TemplateVersion`.
   *  `model` is passed in by the caller (config-driven, ADR-0020) rather than
   *  hardcoded inside the provider — never omitted, no implicit default here. */
  generateProjectDraft(rawIdeaText: string, model: string): Promise<ProjectDraftGenerationOutput>;
}

/**
 * ADR-0020. Structured error taxonomy — every failure mode a provider call can hit
 * maps to one of these, so callers (and logs) can distinguish "your key is wrong"
 * from "OpenRouter is down" from "you asked for a model that doesn't exist" instead
 * of a single generic "upstream_error" bucket.
 */
export type AIProviderErrorCode =
  | 'missing_api_key'
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'rate_limited' // 429
  | 'server_error' // 5xx
  | 'timeout' // connect/response timeout
  | 'invalid_model' // model string rejected by the provider
  | 'malformed_response'
  | 'upstream_error'; // catch-all network/unknown failure

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AIProviderErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
