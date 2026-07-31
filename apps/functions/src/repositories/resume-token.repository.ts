import type { Firestore } from 'firebase-admin/firestore';
import type { SessionResumeToken } from '@insightai/shared-types';

/** Document 5 §9A / ADR-0012. System-only collection — no client read or write
 *  (Document 6 §8A) in either direction. */
export class ResumeTokenRepository {
  constructor(private readonly db: Firestore) {}

  async create(token: string, entry: SessionResumeToken): Promise<void> {
    await this.db.collection('sessionResumeTokens').doc(token).set(entry);
  }

  async get(token: string): Promise<SessionResumeToken | null> {
    const doc = await this.db.collection('sessionResumeTokens').doc(token).get();
    return doc.exists ? (doc.data() as SessionResumeToken) : null;
  }

  async markUsed(token: string, now: number): Promise<void> {
    await this.db.collection('sessionResumeTokens').doc(token).update({ lastUsedAt: now });
  }
}
