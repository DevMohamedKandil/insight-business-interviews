/**
 * One-off local seed script — creates a single `live` template + its current
 * version, directly against the Firestore Emulator, so Document 12 Phase 1's
 * "end-to-end dry run" (S1.7) can happen before the Admin Panel/template editor
 * (S1.5, Phase 2's dashboard) exists. NOT a production tool — production template
 * creation goes through `createTemplate`/`publishTemplate` (Document 9 §3.1/§3.3).
 *
 * Idempotent: deletes any existing template with the same slug (and its versions
 * subcollection) before creating a fresh one, so re-running this while iterating
 * on the demo content never leaves duplicate/orphaned templates behind.
 *
 * Run with the Firestore emulator already running and FIRESTORE_EMULATOR_HOST set:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node scripts/seed-template.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SLUG = 'egyptians-abroad';

async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();

  const existing = await db.collection('templates').where('slug', '==', SLUG).get();
  for (const doc of existing.docs) {
    const versions = await doc.ref.collection('versions').get();
    await Promise.all(versions.docs.map((v) => v.ref.delete()));
    await doc.ref.delete();
  }

  const templateRef = db.collection('templates').doc();
  const versionRef = templateRef.collection('versions').doc();
  const now = Date.now();

  await versionRef.set({
    prompt:
      'إنت باحث اجتماعي شاطر وودود، بتتكلم مع مصريين عايشين بره مصر عشان تفهم منهم إيه أصعب حاجة بتواجههم ' +
      'وهما بعيدين عن بلدهم. إنت مش بتملي استمارة، إنت بتعمل محادثة حقيقية زي ما بتتكلم مع صاحبك. ' +
      'اسأل عن موقف حصل فعلاً معاه مؤخراً، مش رأيه بشكل عام. حاول تفهم إيه اللي بيضايقه أكتر: ' +
      'التواصل مع الأهل، تحويل الفلوس، الأوراق الحكومية، ولا حاجة تانية خالص.',
    conversationRules:
      'اتبع أسلوب The Mom Test: اسأل عن مواقف حصلت فعلاً، مش آراء أو افتراضات. استخدم أسلوب "الخمس ليه" ' +
      'عشان توصل لجوهر المشكلة مش السطح بس. سؤال واحد بس في كل مرة. خلي ردودك قصيرة (2-3 جمل)، ' +
      'بالعامية المصرية، ودافية زي حد بيسمعه فعلاً مش بوت.',
    scoringRules: 'قيّم مدى إلحاح المشكلة واستعداده يدفع فلوس عشان يتحل بناءً على تفاصيل حقيقية ذكرها، مش كلام عام.',
    analysisRules: 'استخرج المشكلة الأساسية، وكل قد إيه بتحصل، وقد إيه بتكلفه وقت أو فلوس، وهو بيعمل إيه فيها دلوقتي.',
    conversationObjectives: [
      { id: 'specific_example', description: 'موقف محدد وحقيقي حصل مؤخراً وهو بعيد عن مصر' },
      { id: 'frequency_cost', description: 'قد إيه المشكلة دي بتتكرر، وبتكلفه قد إيه وقت أو فلوس' },
      { id: 'current_workaround', description: 'هو بيعمل إيه دلوقتي عشان يتعامل مع المشكلة دي' },
    ],
    publishedAt: now,
  });

  await templateRef.set({
    name: 'المصريين في الخارج',
    slug: SLUG,
    description: 'فهم أكبر تحديات المصريين اللي عايشين برة مصر.',
    targetAudience: 'مصريين مقيمين خارج مصر',
    currentVersionId: versionRef.id,
    status: 'live',
    aiProvider: 'openrouter',
    aiModel: 'openai/gpt-4o-mini',
    temperature: 0.85,
    maxTokensPerTurn: 400,
    maxTurns: 8,
    dailySpendCapUsd: 2.0,
    language: 'ar',
    welcomeMessage: 'أهلاً بيك! حابب أفهم منك إيه أصعب حاجة بتواجهك وانت عايش بره مصر. عندك ٣ دقايق تتكلم معايا؟',
    closingMessage: 'الكلام ده كان مفيد جداً — شكراً إنك اتكلمت بصراحة كده. يومك سعيد! 🙏',
    createdAt: now,
    updatedAt: now,
    createdBy: 'seed-script',
  });

  await db.collection('configurations').doc('global').set({
    globalDailySpendCapUsd: 10,
    defaultAiProvider: 'openrouter',
    resumeTokenTtlDays: 7,
    featureFlags: {},
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded template "${SLUG}" (id=${templateRef.id}), version=${versionRef.id}`);
  console.log(`Open: http://localhost:4310/i/${SLUG}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
