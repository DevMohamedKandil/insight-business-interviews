import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();
  const templates = await db.collection('templates').where('slug', '==', 'remote-tenant-matching-service-for-property-owners-in-egypt').get();
  if (templates.empty) { console.log('Template not found'); return; }
  const projectId = templates.docs[0].data().projectId;
  console.log('projectId:', projectId);

  const hyps = await db.collection('projects').doc(projectId).collection('hypotheses').get();
  console.log(`Found ${hyps.size} hypotheses:`);
  for (const h of hyps.docs) {
    console.log(`\n- [${h.id}] ${h.data().text} (priority: ${h.data().priority})`);
    const evidence = await h.ref.collection('evidenceLog').get();
    console.log(`  evidenceLog entries: ${evidence.size}`);
    evidence.docs.forEach((e) => console.log('   ', JSON.stringify(e.data())));
  }

  const version = await db.collection('templates').doc(templates.docs[0].id).collection('versions').doc(templates.docs[0].data().currentVersionId).get();
  console.log('\nConversation objectives in this version:', JSON.stringify(version.data()?.conversationObjectives));
}
main().catch((e) => { console.error(e); process.exit(1); });
