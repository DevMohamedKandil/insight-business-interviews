/** Quick inspection: dump the most recent session's messages to check for real
 *  truncation vs. a screenshot-timing artifact from the browser audit. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  initializeApp({ projectId: 'insightai-dev' });
  const db = getFirestore();

  const sessions = await db.collection('sessions').orderBy('startedAt', 'desc').limit(1).get();
  if (sessions.empty) {
    console.log('No sessions found.');
    return;
  }
  const session = sessions.docs[0];
  console.log('Session:', session.id, JSON.stringify(session.data(), null, 2));

  const messages = await session.ref.collection('messages').orderBy('turnIndex', 'asc').get();
  messages.docs.forEach((m) => {
    const data = m.data();
    console.log(`\n[${data.turnIndex}] ${data.role}: ${data.text}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
