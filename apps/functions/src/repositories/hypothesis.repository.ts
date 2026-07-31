import type { Firestore } from 'firebase-admin/firestore';
import type { Hypothesis, HypothesisEvidenceEntry, ActiveHypothesis } from '@insightai/shared-types';
import { computeHypothesisConfidence } from '../services/hypothesis-confidence.util';

/** ADR-0016/0017/0018. `hypotheses` lives under `projects/{id}` — confidence is
 *  never stored, always recomputed from `evidenceLog` on read (see class doc on
 *  `getWithConfidence`). */
export class HypothesisRepository {
  constructor(private readonly db: Firestore) {}

  async createMany(projectId: string, hypotheses: Hypothesis[]): Promise<string[]> {
    const collection = this.db.collection('projects').doc(projectId).collection('hypotheses');
    const ids: string[] = [];
    for (const h of hypotheses) {
      const ref = await collection.add(h);
      ids.push(ref.id);
    }
    return ids;
  }

  async listActive(projectId: string): Promise<ActiveHypothesis[]> {
    const snap = await this.db.collection('projects').doc(projectId).collection('hypotheses').get();
    return snap.docs.map((d) => ({ id: d.id, text: (d.data() as Hypothesis).text }));
  }

  async get(projectId: string, hypothesisId: string): Promise<Hypothesis | null> {
    const doc = await this.db
      .collection('projects')
      .doc(projectId)
      .collection('hypotheses')
      .doc(hypothesisId)
      .get();
    return doc.exists ? (doc.data() as Hypothesis) : null;
  }

  async appendEvidence(projectId: string, hypothesisId: string, entry: HypothesisEvidenceEntry): Promise<void> {
    await this.db
      .collection('projects')
      .doc(projectId)
      .collection('hypotheses')
      .doc(hypothesisId)
      .collection('evidenceLog')
      .add(entry);
  }

  /** Deterministic status (ADR-0017) — recomputed from the full evidence log every
   *  time, never cached as a stored field, so it can never drift from the data
   *  that justifies it (Document 17's general "recompute vs. denormalize" tradeoff,
   *  decided here in favor of recompute since per-hypothesis evidence volume is
   *  small and bounded). */
  async getWithConfidence(projectId: string, hypothesisId: string) {
    const hypothesis = await this.get(projectId, hypothesisId);
    if (!hypothesis) return null;
    const evidenceSnap = await this.db
      .collection('projects')
      .doc(projectId)
      .collection('hypotheses')
      .doc(hypothesisId)
      .collection('evidenceLog')
      .orderBy('createdAt', 'asc')
      .get();
    const evidenceLog = evidenceSnap.docs.map((d) => d.data() as HypothesisEvidenceEntry);
    return { hypothesis, confidence: computeHypothesisConfidence(evidenceLog), evidenceLog };
  }
}
