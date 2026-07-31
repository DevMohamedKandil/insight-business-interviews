/**
 * Smoke test for the Idea Intake plumbing (ADR-0016/0017/0018) that does NOT
 * require a real OpenRouter key: inserts a fake "draft" Project + Hypotheses
 * directly (as if `generateDraft` had already run), then calls the real
 * `approveDraft` logic and verifies the resulting Template/TemplateVersion are
 * wired correctly — schema, slug uniqueness, hypothesisIds, killCriteriaSnapshot.
 *
 * Run against the Firestore emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node scripts/smoke-test-idea-intake.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ProjectRepository } from '../src/repositories/project.repository';
import { HypothesisRepository } from '../src/repositories/hypothesis.repository';
import { TemplateRepository } from '../src/repositories/template.repository';
import { AuditLogRepository } from '../src/repositories/configuration.repository';
import { IdeaIntakeService } from '../src/services/idea-intake.service';
import { AIProviderFactory } from '../src/providers/ai-provider.factory';
import type { Hypothesis } from '@insightai/shared-types';

async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();

  const projectRepo = new ProjectRepository(db);
  const hypothesisRepo = new HypothesisRepository(db);
  const templateRepo = new TemplateRepository(db);
  const auditLogRepo = new AuditLogRepository(db);
  // No real provider needed for this test — approveDraft never calls the AI.
  const providerFactory = new AIProviderFactory({});
  const ideaIntake = new IdeaIntakeService(
    db,
    projectRepo,
    hypothesisRepo,
    templateRepo,
    auditLogRepo,
    providerFactory,
    'openrouter',
    'openai/gpt-4o-mini'
  );

  const now = Date.now();
  const projectId = await projectRepo.create({
    name: 'Legal Tasks for Egyptians Abroad',
    rawIdeaText: 'I want to build a platform that helps Egyptians living abroad complete legal and governmental tasks in Egypt.',
    generatedTitle: 'Legal Tasks for Egyptians Abroad',
    description: 'A service helping the Egyptian diaspora complete legal/government paperwork remotely.',
    category: 'Legal Services / GovTech',
    businessModelCandidates: ['Per-task fee', 'Subscription', 'Marketplace commission'],
    customerSegments: ['Egyptians abroad', 'Property owners abroad'],
    personas: [
      {
        name: 'Remote Property Owner',
        role: 'primary',
        demographics: 'Egyptian, 35-55, living in the Gulf/Europe/US, owns property in Egypt',
        goals: 'Handle inheritance/property paperwork without flying back',
        frustrations: 'Bureaucracy, needing a trusted proxy, long delays',
        motivations: 'Save time and avoid unreliable intermediaries',
      },
    ],
    suggestedLanguage: 'ar',
    successMetrics: ['Task completion rate', 'Time saved vs. doing it manually'],
    killCriteria: ['Fewer than 20% of interviewees report a real recent instance of this problem'],
    researchObjectives: ['Interview at least 20 Egyptians abroad about legal/government paperwork'],
    conversationObjectives: [
      { id: 'specific_example', description: 'A specific recent legal/government task they needed done in Egypt' },
      { id: 'current_workaround', description: 'How they currently get it done (family, lawyer, agent, etc.)' },
    ],
    generatedPrompt: 'You are a warm researcher interviewing Egyptians abroad about legal/government tasks back home.',
    generatedConversationRules: 'Follow The Mom Test. One question per turn. Keep replies short.',
    welcomeMessage: 'أهلاً! حابب أفهم منك أكتر عن تعاملك مع أوراق حكومية أو قانونية في مصر وانت بره. عندك دقيقتين؟',
    closingMessage: 'شكراً جداً على وقتك — الكلام ده كان مفيد فعلاً. 🙏',
    status: 'draft',
    currentTemplateId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'smoke-test',
  });

  const hypotheses: Hypothesis[] = [
    {
      text: 'Egyptians abroad would pay for a trusted service to handle legal paperwork remotely.',
      type: 'primary',
      category: 'hypothesis',
      priority: 'high',
      reason: 'Founder assumption',
      riskAssumption: 'Assumes willingness to pay for trust/convenience over using family/friends for free.',
      createdAt: now,
    },
  ];
  await hypothesisRepo.createMany(projectId, hypotheses);

  console.log(`Created draft project ${projectId}, approving...`);
  const { templateId, versionId } = await ideaIntake.approveDraft(projectId);
  console.log(`Approved → templateId=${templateId}, versionId=${versionId}`);

  const template = await templateRepo.get(templateId);
  const version = await templateRepo.getVersion(templateId, versionId);
  console.log('Template:', JSON.stringify(template, null, 2));
  console.log('Version:', JSON.stringify(version, null, 2));

  if (template?.status !== 'live') throw new Error('FAIL: template should be live');
  if (!template.projectId) throw new Error('FAIL: template.projectId should be set');
  if (!version?.hypothesisIds.length) throw new Error('FAIL: version.hypothesisIds should be non-empty');
  if (!version.killCriteriaSnapshot.length) throw new Error('FAIL: killCriteriaSnapshot should be non-empty');

  console.log(`\n✔ All checks passed. Open: http://localhost:4310/i/${template.slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
