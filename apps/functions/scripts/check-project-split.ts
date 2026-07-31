import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();
  const snap = await db.collection('projects').orderBy('createdAt', 'desc').limit(1).get();
  if (snap.empty) { console.log('No project found'); return; }
  const p = snap.docs[0].data();
  console.log('researchObjectives:', JSON.stringify(p.researchObjectives, null, 2));
  console.log('conversationObjectives:', JSON.stringify(p.conversationObjectives, null, 2));

  const templates = await db.collection('templates').where('projectId', '==', snap.docs[0].id).get();
  if (!templates.empty) {
    const t = templates.docs[0];
    const version = await t.ref.collection('versions').doc(t.data().currentVersionId).get();
    const v = version.data();
    console.log('\nTemplateVersion keys:', Object.keys(v || {}));
    console.log('TemplateVersion.conversationObjectives:', JSON.stringify(v?.conversationObjectives));
    console.log('TemplateVersion has researchObjectives field?', 'researchObjectives' in (v || {}));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
