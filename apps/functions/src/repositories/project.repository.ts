import type { Firestore } from 'firebase-admin/firestore';
import type { Project } from '@insightai/shared-types';

/** ADR-0016. Root of the Idea Intake → Draft → Template workflow. */
export class ProjectRepository {
  constructor(private readonly db: Firestore) {}

  async create(project: Project): Promise<string> {
    const ref = await this.db.collection('projects').add(project);
    return ref.id;
  }

  async get(projectId: string): Promise<Project | null> {
    const doc = await this.db.collection('projects').doc(projectId).get();
    return doc.exists ? (doc.data() as Project) : null;
  }

  async update(projectId: string, fields: Partial<Project>): Promise<void> {
    await this.db.collection('projects').doc(projectId).update(fields as Record<string, unknown>);
  }
}
