/**
 * ADR-0016. `projects` is the new root for the "Evidence Engine" workflow
 * (Idea → Draft → Founder Review → Template). Additive to `templates` — a
 * `Template.projectId` is optional so hand-authored templates keep working
 * unchanged (see template.types.ts amendment).
 */

import type { ConversationObjective } from './template.types';

/** Every generated claim in the system belongs to exactly one of these — the
 *  founder's explicit "Evidence First" taxonomy. No exceptions. */
export type InsightCategory = 'evidence' | 'inference' | 'hypothesis' | 'recommendation';

export type ProjectStatus = 'draft' | 'active' | 'archived';

export interface Persona {
  name: string;
  role: 'primary' | 'secondary' | 'decision_maker' | 'buyer' | 'user' | 'influencer';
  demographics: string;
  goals: string;
  frustrations: string;
  motivations: string;
}

export interface Project {
  name: string;
  rawIdeaText: string;
  generatedTitle: string;
  description: string;
  category: string;
  businessModelCandidates: string[];
  customerSegments: string[];
  personas: Persona[];
  suggestedLanguage: string;
  successMetrics: string[];
  killCriteria: string[];
  /**
   * ADR-0021, Layer 2: the founder's OWN research plan ("interview at least 20
   * property owners", "compare urban vs rural landlords"). Structurally NEVER
   * carried onto `TemplateVersion` and NEVER passed to the interview model —
   * there is no field on `TemplateVersion` capable of holding this at all.
   */
  researchObjectives: string[];
  /**
   * ADR-0021, Layer 3 (renamed from `coverageGoals`): what ONE conversation
   * should uncover. Carried onto `TemplateVersion.conversationObjectives` at
   * approval time (Document 5 §1.1) — editable by the founder while
   * `status === 'draft'`. This is the ONLY objective type the interview model
   * ever sees.
   */
  conversationObjectives: ConversationObjective[];
  generatedPrompt: string;
  generatedConversationRules: string;
  /** Generated in `suggestedLanguage` — never a hardcoded-English fallback. */
  welcomeMessage: string;
  closingMessage: string;
  status: ProjectStatus;
  currentTemplateId: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type HypothesisType = 'primary' | 'secondary';

/**
 * ADR-0017: `status` is always a value COMPUTED from `evidenceLog` by
 * `hypothesis-confidence.util.ts`, never a number invented by an LLM. Before any
 * evidence exists, every hypothesis is `untested` — there is no other valid
 * pre-evidence state, per the founder's explicit "No Confidence Scores Before
 * Evidence" rule.
 */
export type HypothesisStatus = 'untested' | 'evidence_emerging' | 'validated' | 'contradicted' | 'inconclusive';
export type HypothesisPriority = 'high' | 'medium' | 'low';

export interface Hypothesis {
  text: string;
  type: HypothesisType;
  category: InsightCategory; // always 'hypothesis' at creation — kept explicit per the taxonomy rule
  priority: HypothesisPriority;
  reason: string; // e.g. "Founder assumption" — never a fabricated justification
  riskAssumption: string;
  createdAt: number;
}

export type EvidenceType = 'supports' | 'contradicts' | 'neutral';

/**
 * ADR-0018. Append-only — one entry per (hypothesis, respondent message) pair
 * where the model judged the message relevant. This log, replayed in order, IS
 * the "Evidence History" timeline the founder asked for — no separate timeline
 * collection needed.
 */
export interface HypothesisEvidenceEntry {
  sessionId: string;
  messageId: string;
  evidenceType: EvidenceType;
  excerpt: string;
  createdAt: number;
}

/** Deterministic output of hypothesis-confidence.util.ts — never persisted as a
 *  separate source of truth, always recomputed from the evidence log so it can
 *  never drift out of sync with the data that justifies it. */
export interface HypothesisConfidence {
  status: HypothesisStatus;
  supportingCount: number;
  contradictingCount: number;
  neutralCount: number;
  totalCount: number;
  reasoning: string; // human-readable explanation of how status was derived, e.g.
  // "7 supporting, 2 contradicting out of 9 total — Medium confidence"
}
