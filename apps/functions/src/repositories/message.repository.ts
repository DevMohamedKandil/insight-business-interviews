import type { Firestore } from 'firebase-admin/firestore';
import type { Message } from '@insightai/shared-types';

/** Document 5 §2.1 — `sessions/{id}/messages` subcollection. */
export class MessageRepository {
  constructor(private readonly db: Firestore) {}

  async append(sessionId: string, message: Message): Promise<string> {
    const ref = await this.db.collection('sessions').doc(sessionId).collection('messages').add(message);
    return ref.id;
  }

  /** Bounded read for the sliding-window history rule (Document 10 §3) and for
   *  resumeSession's history replay (Document 9 §2.3). */
  async getRecent(sessionId: string, limitCount: number): Promise<Message[]> {
    const snap = await this.db
      .collection('sessions')
      .doc(sessionId)
      .collection('messages')
      .orderBy('turnIndex', 'asc')
      .limitToLast(limitCount)
      .get();
    return snap.docs.map((d) => d.data() as Message);
  }

  async count(sessionId: string): Promise<number> {
    const snap = await this.db.collection('sessions').doc(sessionId).collection('messages').count().get();
    return snap.data().count;
  }
}
