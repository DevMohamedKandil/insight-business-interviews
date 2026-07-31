import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(10).get();
  console.log(`Found ${snap.size} recent audit log entries:`);
  snap.docs.forEach((d) => console.log(JSON.stringify(d.data())));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
