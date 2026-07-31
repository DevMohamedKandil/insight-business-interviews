/** Firestore schema types for the `templates` collection family. See docs/05-firestore-collections.md §1. */

export type TemplateStatus = 'draft' | 'live' | 'paused' | 'archived';

/**
 * ADR-0021 (renamed from `CoverageGoal`): Layer 3 only (docs/23-prompt-architecture-redesign.md).
 * This is the ONLY objective shape the interview model ever sees — a research-plan
 * item (Layer 2, `Project.researchObjectives`) must never be represented with this
 * type or flow into a `TemplateVersion`.
 */
export interface ConversationObjective {
  id: string;
  description: string;
}

export interface Template {
  name: string;
  slug: string;
  description: string;
  targetAudience: string;
  currentVersionId: string | null;
  status: TemplateStatus;
  /** ADR-0016: nullable — set only for templates generated via Idea Intake
   *  (project.types.ts). Hand-authored templates (e.g. the seed script) have no
   *  project and continue to work exactly as before. */
  projectId: string | null;
  /** ADR-0011: Phase 1 uses OpenRouter exclusively; this holds an OpenRouter model
   *  string (e.g. "openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"). Switching
   *  vendors is therefore a config change to this one field. */
  aiProvider: 'openrouter';
  aiModel: string;
  temperature: number;
  maxTokensPerTurn: number;
  maxTurns: number;
  dailySpendCapUsd: number;
  language: string;
  welcomeMessage: string;
  closingMessage: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface TemplateVersion {
  prompt: string;
  conversationRules: string;
  scoringRules: string;
  analysisRules: string;
  /** ADR-0021: Layer 3 only. This field has NO Layer-2 (research objective)
   *  counterpart anywhere on this type — structurally impossible to carry a
   *  research-plan item into the interview engine, not just discouraged. */
  conversationObjectives: ConversationObjective[];
  /** ADR-0018: hypothesis ids (from `projects/{id}/hypotheses`) active for this
   *  version — passed into the system prompt alongside conversation objectives so
   *  the model can tag per-turn evidence against them. Empty for non-project
   *  templates. Read-only/classification-only (docs/23 §3) — never influences
   *  question selection or termination. */
  hypothesisIds: string[];
  /** Pinned at publish time from the project's kill criteria at that moment —
   *  deliberately NOT a live reference to the project, so a founder can't
   *  retroactively loosen kill criteria after seeing evidence they don't like
   *  (the confirmation-bias guard discussed when this was designed). Never read
   *  by the interview engine (docs/23 §4 leak audit, item 5). */
  killCriteriaSnapshot: string[];
  publishedAt: number;
}
