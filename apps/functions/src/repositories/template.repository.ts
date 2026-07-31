import type { Firestore } from 'firebase-admin/firestore';
import type { Template, TemplateVersion } from '@insightai/shared-types';

/** Document 5 §1 / §1.1. One repository per collection (Architecture §2). */
export class TemplateRepository {
  constructor(private readonly db: Firestore) {}

  async getBySlug(slug: string): Promise<{ id: string; template: Template } | null> {
    const snap = await this.db.collection('templates').where('slug', '==', slug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, template: doc.data() as Template };
  }

  async get(templateId: string): Promise<Template | null> {
    const doc = await this.db.collection('templates').doc(templateId).get();
    return doc.exists ? (doc.data() as Template) : null;
  }

  async getVersion(templateId: string, versionId: string): Promise<TemplateVersion | null> {
    const doc = await this.db
      .collection('templates')
      .doc(templateId)
      .collection('versions')
      .doc(versionId)
      .get();
    return doc.exists ? (doc.data() as TemplateVersion) : null;
  }
}
