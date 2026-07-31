import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();
  const snap = await db.collection('sessions').orderBy('startedAt', 'desc').limit(1).get();
  const s = snap.docs[0].data();
  console.log('status:', s.status, '| turnCount:', s.turnCount);
  console.log('conversationObjectiveEvidence:', JSON.stringify(s.conversationObjectiveEvidence, null, 2));
  console.log('respondentIndicatedNoMoreToAdd:', s.respondentIndicatedNoMoreToAdd);
  console.log('estimatedCostUsd:', s.estimatedCostUsd);
}
main().catch((e) => { console.error(e); process.exit(1); });
