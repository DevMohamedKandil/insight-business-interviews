import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, doc, docData, collection, collectionData } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import type { Project, Hypothesis } from '@insightai/shared-types';

/** Thin client wrapper around the Idea Intake admin functions/reads (Document 11
 *  §5's "thin client-side service" pattern, same as InterviewService). */
@Injectable({ providedIn: 'root' })
export class ProjectIntakeService {
  private readonly functions = inject(Functions);
  private readonly firestore = inject(Firestore);

  async generateDraft(rawIdeaText: string): Promise<{ projectId: string }> {
    const callable = httpsCallable<{ rawIdeaText: string }, { projectId: string }>(
      this.functions,
      'generateProjectDraft'
    );
    const { data } = await callable({ rawIdeaText });
    return data;
  }

  async approveDraft(projectId: string): Promise<{ templateId: string; versionId: string }> {
    const callable = httpsCallable<{ projectId: string }, { templateId: string; versionId: string }>(
      this.functions,
      'approveProjectDraft'
    );
    const { data } = await callable({ projectId });
    return data;
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return firstValueFrom(docData(doc(this.firestore, 'projects', projectId))) as Promise<Project | undefined>;
  }

  async getHypotheses(projectId: string): Promise<Array<Hypothesis & { id: string }>> {
    return firstValueFrom(
      collectionData(collection(this.firestore, 'projects', projectId, 'hypotheses'), { idField: 'id' })
    ) as Promise<Array<Hypothesis & { id: string }>>;
  }

  async getTemplateSlug(templateId: string): Promise<string | undefined> {
    const template = await firstValueFrom(docData(doc(this.firestore, 'templates', templateId)));
    return (template as { slug?: string } | undefined)?.slug;
  }
}
