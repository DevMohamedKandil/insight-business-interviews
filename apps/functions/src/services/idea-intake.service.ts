import type { Firestore } from 'firebase-admin/firestore';
import type { Hypothesis, Template, TemplateVersion } from '@insightai/shared-types';
import { ProjectRepository } from '../repositories/project.repository';
import { HypothesisRepository } from '../repositories/hypothesis.repository';
import { TemplateRepository } from '../repositories/template.repository';
import { AuditLogRepository } from '../repositories/configuration.repository';
import { AIProviderFactory } from '../providers/ai-provider.factory';

export class ProjectNotFoundError extends Error {}
export class ProjectNotDraftError extends Error {}

/**
 * Build Now (this session). Idea → Draft → Founder Review → Auto Template
 * Generation. Deliberately does NOT implement Phase 2 (cross-interview analysis/
 * recommendations) or Phase 3 (Founder Workspace) — those are Build Next/Backlog
 * per the founder's own explicit scope decision.
 */
export class IdeaIntakeService {
  private readonly defaultTemplateDefaults;

  constructor(
    private readonly db: Firestore,
    private readonly projectRepo: ProjectRepository,
    private readonly hypothesisRepo: HypothesisRepository,
    private readonly templateRepo: TemplateRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly providerFactory: AIProviderFactory,
    /** ADR-0011/ADR-0020: which registered `IAIProvider` key to resolve — config-driven, not hardcoded. */
    private readonly defaultAiProvider: string,
    /** ADR-0020: config-driven default model — never a string literal in this file. */
    private readonly defaultAiModel: string
  ) {
    this.defaultTemplateDefaults = {
      aiProvider: 'openrouter' as const, // ADR-0011: sole registered provider key for Phase 1
      aiModel: this.defaultAiModel,
      temperature: 0.8,
      maxTokensPerTurn: 400,
      maxTurns: 10,
      dailySpendCapUsd: 2.0, // Document 16 §4's recommended MVP default
    };
  }

  /** Generates an editable draft from a plain-language idea description. Resolves
   *  the configured default provider (ADR-0020) rather than reading a template's
   *  `aiProvider` field, since no template exists yet. */
  async generateDraft(rawIdeaText: string, createdBy: string): Promise<{ projectId: string }> {
    const provider = this.providerFactory.resolve(this.defaultAiProvider);
    const startedAt = Date.now();
    const draft = await provider.generateProjectDraft(rawIdeaText, this.defaultAiModel);

    const now = Date.now();
    const projectId = await this.projectRepo.create({
      name: draft.generatedTitle,
      rawIdeaText,
      generatedTitle: draft.generatedTitle,
      description: draft.description,
      category: draft.category,
      businessModelCandidates: draft.businessModelCandidates,
      customerSegments: draft.customerSegments,
      personas: draft.personas,
      suggestedLanguage: draft.suggestedLanguage,
      successMetrics: draft.successMetrics,
      killCriteria: draft.killCriteria,
      researchObjectives: draft.researchObjectives,
      conversationObjectives: draft.conversationObjectives,
      generatedPrompt: draft.generatedPrompt,
      generatedConversationRules: draft.generatedConversationRules,
      welcomeMessage: draft.welcomeMessage,
      closingMessage: draft.closingMessage,
      status: 'draft',
      currentTemplateId: null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    });

    const hypotheses: Hypothesis[] = draft.hypotheses.map((h) => ({
      text: h.text,
      type: h.type,
      category: 'hypothesis',
      priority: h.priority,
      reason: h.reason,
      riskAssumption: h.riskAssumption,
      createdAt: now,
    }));
    await this.hypothesisRepo.createMany(projectId, hypotheses);

    // Cost observability (PRD NFR-Observability) for every LLM call, including this
    // admin-only one — ADR-0019's point that the provider layer's metering applies
    // uniformly, not just to respondent-facing calls. Not spend-cap-gated: this path
    // is admin-authenticated only (low, trusted volume), unlike the public interview
    // surface — a deliberate, narrower scope decision for Build Now, not an oversight.
    await this.auditLogRepo.log({
      type: 'llm_call',
      actorUid: createdBy,
      templateId: null,
      sessionId: null,
      details: {
        provider: this.defaultAiProvider,
        model: this.defaultAiModel,
        operation: 'generateProjectDraft',
        projectId,
        promptTokens: draft.usage.promptTokens,
        completionTokens: draft.usage.completionTokens,
        costEstimateUsd: draft.usage.costEstimateUsd,
        latencyMs: Date.now() - startedAt,
      },
      createdAt: now,
    });

    return { projectId };
  }

  /** Converts an approved (possibly founder-edited) draft into a real, live
   *  Template + TemplateVersion, reusing the exact repositories/schema the
   *  hand-authored path uses (Document 5 §1/§1.1) — zero special-casing downstream. */
  async approveDraft(projectId: string): Promise<{ templateId: string; versionId: string }> {
    const project = await this.projectRepo.get(projectId);
    if (!project) throw new ProjectNotFoundError();
    if (project.status !== 'draft') throw new ProjectNotDraftError();

    const activeHypotheses = await this.hypothesisRepo.listActive(projectId);
    const slug = await this.uniqueSlugFor(project.generatedTitle);
    const now = Date.now();

    const templateRef = this.db.collection('templates').doc();
    const versionRef = templateRef.collection('versions').doc();

    const version: TemplateVersion = {
      prompt: project.generatedPrompt,
      conversationRules: project.generatedConversationRules,
      scoringRules:
        'Rate urgency and buyingIntent based on how concretely costly/urgent the respondent describes the problem.',
      analysisRules: 'Extract pain point, frequency, money/time lost, and any current workaround.',
      // ADR-0021: `project.researchObjectives` (Layer 2) is deliberately never
      // referenced anywhere in this file — TemplateVersion has no field capable
      // of carrying it, so there is nothing to "forget" to exclude.
      conversationObjectives: project.conversationObjectives,
      hypothesisIds: activeHypotheses.map((h) => h.id), // ADR-0018
      killCriteriaSnapshot: project.killCriteria, // pinned, not a live reference — see template.types.ts
      publishedAt: now,
    };
    await versionRef.set(version);

    const template: Template = {
      name: project.generatedTitle,
      slug,
      description: project.description,
      targetAudience: project.customerSegments.join(', '),
      currentVersionId: versionRef.id,
      status: 'live',
      projectId,
      ...this.defaultTemplateDefaults,
      language: project.suggestedLanguage,
      welcomeMessage: project.welcomeMessage,
      closingMessage: project.closingMessage,
      createdAt: now,
      updatedAt: now,
      createdBy: project.createdBy,
    };
    await templateRef.set(template);

    await this.projectRepo.update(projectId, {
      status: 'active',
      currentTemplateId: templateRef.id,
      updatedAt: now,
    });

    return { templateId: templateRef.id, versionId: versionRef.id };
  }

  private async uniqueSlugFor(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'project';

    let candidate = base;
    let suffix = 1;
    while (await this.templateRepo.getBySlug(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }
}
