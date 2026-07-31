import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** Document 5 §6 / Document 4 §4. Deterministic composite ID (`templateId_date`) so
 *  updates are a single `set({...}, {merge:true})` — no query needed to find "today's
 *  rollup," and no ever-growing hot document (Document 15 R4 / Document 17 S1). */
export class AnalyticsRollupRepository {
  constructor(private readonly db: Firestore) {}

  private docId(templateId: string, date: string): string {
    return `${templateId}_${date}`;
  }

  async incrementInterviewStarted(templateId: string, date: string): Promise<void> {
    await this.db
      .collection('analyticsRollups')
      .doc(this.docId(templateId, date))
      .set(
        { templateId, date, interviewsStarted: FieldValue.increment(1) },
        { merge: true }
      );
  }

  async incrementSessionOutcome(
    templateId: string,
    date: string,
    outcome: 'completed' | 'abandoned',
    durationSeconds: number,
    costUsd: number
  ): Promise<void> {
    const field = outcome === 'completed' ? 'interviewsCompleted' : 'interviewsAbandoned';
    await this.db
      .collection('analyticsRollups')
      .doc(this.docId(templateId, date))
      .set(
        {
          templateId,
          date,
          [field]: FieldValue.increment(1),
          totalDurationSeconds: FieldValue.increment(durationSeconds),
          estimatedCostUsd: FieldValue.increment(costUsd),
        },
        { merge: true }
      );
  }

  /** Sum of today's `estimatedCostUsd` across the rollup — used by SpendGuardService
   *  (Document 6 §4) to enforce the per-template daily cap. */
  async getTodaySpend(templateId: string, date: string): Promise<number> {
    const doc = await this.db.collection('analyticsRollups').doc(this.docId(templateId, date)).get();
    if (!doc.exists) return 0;
    return (doc.data()?.estimatedCostUsd as number) ?? 0;
  }

  async getGlobalTodaySpend(date: string): Promise<number> {
    const snap = await this.db.collection('analyticsRollups').where('date', '==', date).get();
    return snap.docs.reduce((sum, d) => sum + ((d.data().estimatedCostUsd as number) ?? 0), 0);
  }
}
