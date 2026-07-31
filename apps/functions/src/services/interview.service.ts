import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Message,
  MessageClassification,
  Session,
  StreamEvent,
  ConversationTurn,
} from '@insightai/shared-types';
import { TemplateRepository } from '../repositories/template.repository';
import { SessionRepository } from '../repositories/session.repository';
import { MessageRepository } from '../repositories/message.repository';
import { ResumeTokenRepository } from '../repositories/resume-token.repository';
import { AnalyticsRollupRepository } from '../repositories/analytics-rollup.repository';
import { AuditLogRepository } from '../repositories/configuration.repository';
import { HypothesisRepository } from '../repositories/hypothesis.repository';
import { AIProviderFactory } from '../providers/ai-provider.factory';
import { SpendGuardService } from './spend-guard.service';
import { AbuseDetectionService } from './abuse-detection.service';
import { mergeEvidenceLevel, isStrongOrVerified } from './evidence-level.util';
import { detectPolicyViolations } from './interview-policy-violations.util';

const HISTORY_WINDOW_TURNS = 12; // Document 10 §3 — 12 turns = 24 messages
const RESUME_TOKEN_TTL_DAYS_FALLBACK = 7;

export class SessionNotFoundError extends Error {}
export class SessionAccessDeniedError extends Error {}
export class SessionNotActiveError extends Error {}
export class TemplateUnavailableError extends Error {}
export class ResumeTokenInvalidError extends Error {}

export interface StartSessionResult {
  sessionId: string;
  resumeToken: string;
  welcomeMessage: string;
  language: string;
}

export interface ResumeSessionResult {
  sessionId: string;
  templateSlug: string;
  language: string;
  status: Session['status'];
  messages: Array<{ role: string; text: string; turnIndex: number }>;
}

export class InterviewService {
  constructor(
    private readonly db: Firestore,
    private readonly templateRepo: TemplateRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly messageRepo: MessageRepository,
    private readonly resumeTokenRepo: ResumeTokenRepository,
    private readonly rollupRepo: AnalyticsRollupRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly hypothesisRepo: HypothesisRepository,
    private readonly providerFactory: AIProviderFactory,
    private readonly spendGuard: SpendGuardService,
    private readonly abuseDetection: AbuseDetectionService
  ) {}

  /** Document 9 §2.1. */
  async startSession(templateSlug: string, respondentUid: string): Promise<StartSessionResult> {
    const found = await this.templateRepo.getBySlug(templateSlug);
    if (!found || found.template.status !== 'live') {
      throw new TemplateUnavailableError(templateSlug);
    }
    const { id: templateId, template } = found;
    if (!template.currentVersionId) throw new TemplateUnavailableError(templateSlug);

    const sessionRef = this.db.collection('sessions').doc();
    const now = Date.now();
    const resumeToken = randomBytes(24).toString('base64url'); // Document 6 §8A / ADR-0012

    const session: Session = {
      templateId,
      templateVersionId: template.currentVersionId,
      templateName: template.name,
      templateSlug: template.slug,
      respondentUid,
      status: 'active',
      abandonReason: null,
      startedAt: now,
      endedAt: null,
      turnCount: 0,
      conversationObjectiveEvidence: {},
      respondentIndicatedNoMoreToAdd: false,
      estimatedCostUsd: 0,
      topPainPoint: null,
      topUrgency: null,
      respondentCountry: null,
      respondentOccupation: null,
      synthesisReportId: null,
      abuseFlag: false,
      resumeTokenExpiresAt: now + RESUME_TOKEN_TTL_DAYS_FALLBACK * 24 * 60 * 60 * 1000,
    };

    await this.sessionRepo.create(sessionRef.id, session);
    await this.resumeTokenRepo.create(resumeToken, {
      sessionId: sessionRef.id,
      createdAt: now,
      expiresAt: session.resumeTokenExpiresAt!,
      lastUsedAt: null,
    });
    await this.rollupRepo.incrementInterviewStarted(templateId, dateKey(now));

    return {
      sessionId: sessionRef.id,
      resumeToken,
      welcomeMessage: template.welcomeMessage,
      language: template.language,
    };
  }

  /** Document 9 §2.3 / ADR-0012. */
  async resumeSession(resumeToken: string, newRespondentUid: string): Promise<ResumeSessionResult> {
    const entry = await this.resumeTokenRepo.get(resumeToken);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new ResumeTokenInvalidError();
    }

    const session = await this.sessionRepo.get(entry.sessionId);
    if (!session) throw new ResumeTokenInvalidError();

    // `language` lives on the template (Document 5 §1), not the session — Session
    // has no `language` field of its own (Document 5 §2's schema).
    const template = await this.templateRepo.get(session.templateId);

    await this.sessionRepo.update(entry.sessionId, { respondentUid: newRespondentUid });
    await this.resumeTokenRepo.markUsed(resumeToken, Date.now());

    const recent = await this.messageRepo.getRecent(entry.sessionId, HISTORY_WINDOW_TURNS * 2);
    return {
      sessionId: entry.sessionId,
      templateSlug: session.templateSlug,
      language: template?.language ?? 'en',
      status: session.status,
      messages: recent.map((m) => ({ role: m.role, text: m.text, turnIndex: m.turnIndex })),
    };
  }

  /** Document 10 §2 — the full sendMessage sequence. `onToken` streams reply text as
   *  it's generated (Document 3 §6 / ADR-0013); the return value is the final outcome
   *  once persistence completes. */
  async processTurn(
    sessionId: string,
    respondentUid: string,
    text: string,
    onToken: (value: string) => void
  ): Promise<{
    turnCount: number;
    sessionStatus: Session['status'];
    closingMessage?: string;
  }> {
    const session = await this.sessionRepo.get(sessionId);
    if (!session) throw new SessionNotFoundError();
    if (session.respondentUid !== respondentUid) throw new SessionAccessDeniedError();
    if (session.status !== 'active') throw new SessionNotActiveError();

    const template = await this.templateRepo.get(session.templateId);
    if (!template) throw new TemplateUnavailableError(session.templateId);

    // Step 3 (Document 10 §2): spend check BEFORE any paid call.
    const budget = await this.spendGuard.checkBudget(session.templateId, template);
    if (!budget.allowed) {
      await this.sessionRepo.update(sessionId, {
        status: 'abandoned',
        abandonReason: 'spend_cap',
        endedAt: Date.now(),
      });
      await this.rollupRepo.incrementSessionOutcome(
        session.templateId,
        dateKey(session.startedAt),
        'abandoned',
        Math.round((Date.now() - session.startedAt) / 1000),
        session.estimatedCostUsd
      );
      return {
        turnCount: session.turnCount,
        sessionStatus: 'abandoned',
        closingMessage: template.closingMessage,
      };
    }

    // Step 4: heuristic abuse scan — flags, never blocks (Document 6 §5.3).
    const { heuristicFlag } = this.abuseDetection.scan(text);

    // Step 5: build bounded context.
    const version = await this.templateRepo.getVersion(session.templateId, session.templateVersionId);
    if (!version) throw new TemplateUnavailableError(session.templateId);

    // ADR-0021/Document 24: an objective is "remaining" until its evidence is
    // strong-or-verified — a merely-mentioned (weak/medium) objective still gets
    // probed further, unlike the old binary satisfied/not-satisfied check.
    const remainingObjectives = version.conversationObjectives.filter(
      (o) => !isStrongOrVerified(session.conversationObjectiveEvidence[o.id])
    );
    const recentMessages = await this.messageRepo.getRecent(sessionId, HISTORY_WINDOW_TURNS * 2);
    const history: ConversationTurn[] = [
      ...recentMessages.map((m) => ({ role: m.role, text: m.text }) as ConversationTurn),
      { role: 'respondent', text },
    ];

    const systemPrompt = [
      version.prompt,
      version.conversationRules,
      `Respond only in this language: ${template.language}.`,
    ].join('\n\n');

    // ADR-0016/0018: only project-linked templates carry hypotheses; hand-authored
    // templates (no projectId) simply pass an empty list and get no evidence tags.
    const allProjectHypotheses = template.projectId
      ? await this.hypothesisRepo.listActive(template.projectId)
      : [];
    const activeHypotheses = allProjectHypotheses.filter((h) => version.hypothesisIds.includes(h.id));

    // Step 6-7: resolve provider, call it, stream tokens.
    const provider = this.providerFactory.resolve(template.aiProvider);
    const startedAt = Date.now();
    const output = await provider.generateInterviewTurnStreaming(
      {
        systemPrompt,
        history,
        remainingConversationObjectives: remainingObjectives,
        activeHypotheses,
        model: template.aiModel,
        temperature: template.temperature,
        maxTokens: template.maxTokensPerTurn,
      },
      (event: StreamEvent) => {
        if (event.type === 'token') onToken(event.value);
      }
    );
    const latencyMs = Date.now() - startedAt;

    const classification: MessageClassification = output.extraction;
    const abuseFlag = heuristicFlag || output.selfReportedInjectionAttempt;
    const nextTurnIndex = await this.messageRepo.count(sessionId);

    // Document 26, Phase A (Measurement Only): deterministic, non-LLM checks — logged
    // for visibility, never blocking or altering this turn's already-streamed reply.
    const previousAssistantMessage = [...recentMessages].reverse().find((m) => m.role === 'assistant');
    const policyViolations = detectPolicyViolations(
      output.replyText,
      session.conversationObjectiveEvidence,
      version.conversationObjectives.map((o) => o.id),
      previousAssistantMessage?.text ?? null
    );

    // Step 8: persist respondent + assistant messages.
    const respondentMessageId = await this.messageRepo.append(sessionId, {
      role: 'respondent',
      text, // masking hook: docs/06 §7 — see security/pii-masking.ts, applied before this call in production
      turnIndex: nextTurnIndex,
      createdAt: startedAt,
      classification,
    } as Message);
    await this.messageRepo.append(sessionId, {
      role: 'assistant',
      text: output.replyText,
      turnIndex: nextTurnIndex + 1,
      createdAt: Date.now(),
      classification: null,
    } as Message);

    // ADR-0018: append one evidence-log entry per tagged hypothesis — this log,
    // replayed in order, IS the "Evidence History" timeline (no separate collection).
    if (template.projectId) {
      for (const tag of classification.hypothesisEvidence) {
        await this.hypothesisRepo.appendEvidence(template.projectId, tag.hypothesisId, {
          sessionId,
          messageId: respondentMessageId,
          evidenceType: tag.evidenceType,
          excerpt: tag.excerpt,
          createdAt: startedAt,
        });
      }
    }

    // ADR-0021/Document 24: merge this turn's reported levels into the session's
    // running evidence map — monotonic, never regresses an objective that
    // already reached a higher level (evidence-level.util.ts).
    const newEvidenceMap = { ...session.conversationObjectiveEvidence };
    for (const report of output.objectiveEvidence) {
      newEvidenceMap[report.id] = mergeEvidenceLevel(newEvidenceMap[report.id], report.level);
    }
    const newTurnCount = session.turnCount + 1;

    // Step 9: termination check (Architecture §5 / ADR-0004, redesigned per
    // Document 23 Layer 5 — Evidence Contract). A Research Objective (Layer 2)
    // can never appear in `version.conversationObjectives` at all (ADR-0021),
    // so it structurally cannot influence this check the way it did before the
    // redesign.
    const allObjectivesStrongOrVerified = version.conversationObjectives.every((o) =>
      isStrongOrVerified(newEvidenceMap[o.id])
    );
    const maxTurnsReached = newTurnCount >= template.maxTurns;
    const shouldTerminate =
      (allObjectivesStrongOrVerified || output.respondentIndicatedNoMoreToAdd) || maxTurnsReached;

    await this.sessionRepo.update(sessionId, {
      turnCount: newTurnCount,
      estimatedCostUsd: session.estimatedCostUsd + output.usage.costEstimateUsd,
      conversationObjectiveEvidence: newEvidenceMap,
      respondentIndicatedNoMoreToAdd: session.respondentIndicatedNoMoreToAdd || output.respondentIndicatedNoMoreToAdd,
      topPainPoint: classification.painPoint ?? session.topPainPoint,
      topUrgency: classification.urgency ?? session.topUrgency,
      abuseFlag: session.abuseFlag || abuseFlag,
      ...(shouldTerminate ? { status: 'completed' as const, endedAt: Date.now() } : {}),
    });

    await this.auditLogRepo.log({
      type: 'llm_call',
      actorUid: respondentUid,
      templateId: session.templateId,
      sessionId,
      details: {
        provider: template.aiProvider,
        model: template.aiModel,
        promptTokens: output.usage.promptTokens,
        completionTokens: output.usage.completionTokens,
        costEstimateUsd: output.usage.costEstimateUsd,
        latencyMs,
        abuseFlag,
        policyViolations, // Document 26 Phase A — measurement only, never fed back yet
      },
      createdAt: Date.now(),
    });

    if (shouldTerminate) {
      await this.rollupRepo.incrementSessionOutcome(
        session.templateId,
        dateKey(session.startedAt),
        'completed',
        Math.round((Date.now() - session.startedAt) / 1000),
        session.estimatedCostUsd + output.usage.costEstimateUsd
      );
    }

    return {
      turnCount: newTurnCount,
      sessionStatus: shouldTerminate ? 'completed' : 'active',
      ...(shouldTerminate ? { closingMessage: template.closingMessage } : {}),
    };
  }
}

function dateKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
