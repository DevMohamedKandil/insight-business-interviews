import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';

import { TemplateRepository } from './repositories/template.repository';
import { SessionRepository } from './repositories/session.repository';
import { MessageRepository } from './repositories/message.repository';
import { ResumeTokenRepository } from './repositories/resume-token.repository';
import { AnalyticsRollupRepository } from './repositories/analytics-rollup.repository';
import { ConfigurationRepository, AuditLogRepository } from './repositories/configuration.repository';
import { ProjectRepository } from './repositories/project.repository';
import { HypothesisRepository } from './repositories/hypothesis.repository';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { SpendGuardService } from './services/spend-guard.service';
import { AbuseDetectionService } from './services/abuse-detection.service';
import { InterviewService } from './services/interview.service';
import { IdeaIntakeService } from './services/idea-intake.service';
import { InMemoryRateLimiter } from './security/rate-limiter';

/** Document 6 §8 — Secret Manager only, never Firestore/env-committed. Locally, the
 *  Firebase Emulator Suite reads this from apps/functions/.secret.local (gitignored). */
export const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

/**
 * ADR-0020. Config-driven defaults — never redeploy code just to change the
 * default model. Does NOT replace `Template.aiModel` (Document 5 §1's per-template
 * override, unchanged); this is only the seed value used where no template exists
 * yet (Idea Intake's meta-generation call, and a newly-approved project's initial
 * template default).
 */
export const aiProviderConfig = defineString('AI_PROVIDER', { default: 'openrouter' });
export const aiModelConfig = defineString('AI_MODEL', { default: 'openai/gpt-4o-mini' });

initializeApp();

let wired: ReturnType<typeof wire> | null = null;

function wire() {
  const db = getFirestore();

  const templateRepo = new TemplateRepository(db);
  const sessionRepo = new SessionRepository(db);
  const messageRepo = new MessageRepository(db);
  const resumeTokenRepo = new ResumeTokenRepository(db);
  const rollupRepo = new AnalyticsRollupRepository(db);
  const configRepo = new ConfigurationRepository(db);
  const auditLogRepo = new AuditLogRepository(db);
  const projectRepo = new ProjectRepository(db);
  const hypothesisRepo = new HypothesisRepository(db);

  const providerFactory = new AIProviderFactory({
    openrouter: new OpenRouterProvider(openRouterApiKey.value()),
  });

  const spendGuard = new SpendGuardService(rollupRepo, configRepo);
  const abuseDetection = new AbuseDetectionService();

  const interviewService = new InterviewService(
    db,
    templateRepo,
    sessionRepo,
    messageRepo,
    resumeTokenRepo,
    rollupRepo,
    auditLogRepo,
    hypothesisRepo,
    providerFactory,
    spendGuard,
    abuseDetection
  );

  const ideaIntakeService = new IdeaIntakeService(
    db,
    projectRepo,
    hypothesisRepo,
    templateRepo,
    auditLogRepo,
    providerFactory,
    aiProviderConfig.value(),
    aiModelConfig.value()
  );

  const startSessionLimiter = new InMemoryRateLimiter(60 * 60 * 1000, 20); // 20/hour/uid
  const sendMessageLimiter = new InMemoryRateLimiter(60 * 1000, 30); // 30/min/uid

  return { db, interviewService, ideaIntakeService, startSessionLimiter, sendMessageLimiter };
}

/** Constructed once per Functions instance, per Document 10 §6 (module scope stays
 *  warm across invocations on the same instance). */
export function getServices() {
  if (!wired) wired = wire();
  return wired;
}
