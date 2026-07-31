import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Session } from '@insightai/shared-types';

/** Document 5 §2. Direct client writes to this collection are denied by Firestore
 *  Rules (ADR-0007) — every write here happens through this repository, called only
 *  from the Service Layer running under Admin SDK privileges. */
export class SessionRepository {
  constructor(private readonly db: Firestore) {}

  async create(sessionId: string, session: Session): Promise<void> {
    await this.db.collection('sessions').doc(sessionId).set(session);
  }

  async get(sessionId: string): Promise<Session | null> {
    const doc = await this.db.collection('sessions').doc(sessionId).get();
    return doc.exists ? (doc.data() as Session) : null;
  }

  async update(sessionId: string, fields: Partial<Session>): Promise<void> {
    await this.db.collection('sessions').doc(sessionId).update(fields as Record<string, unknown>);
  }

  async incrementTurnAndCost(sessionId: string, costDeltaUsd: number): Promise<void> {
    await this.db
      .collection('sessions')
      .doc(sessionId)
      .update({
        turnCount: FieldValue.increment(1),
        estimatedCostUsd: FieldValue.increment(costDeltaUsd),
      });
  }
}
