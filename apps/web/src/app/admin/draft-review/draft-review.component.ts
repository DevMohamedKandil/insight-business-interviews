import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectIntakeService } from '../project-intake.service';
import type { Project, Hypothesis } from '@insightai/shared-types';

/**
 * "Founder Review" step. Read + approve for this first pass — inline editing of
 * the generated fields is the natural next increment (the schema already supports
 * it; `updateProjectDraft` would be a straightforward addition), scoped out here
 * to keep Build Now's first slice shippable and testable end-to-end.
 */
@Component({
  selector: 'app-draft-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (project(); as p) {
      <div class="page">
        <h2>{{ p.generatedTitle }}</h2>
        <p class="muted">{{ p.category }} · language: {{ p.suggestedLanguage }}</p>
        <p>{{ p.description }}</p>

        <h3>Business Model Candidates</h3>
        <ul>@for (b of p.businessModelCandidates; track b) { <li>{{ b }}</li> }</ul>

        <h3>Customer Segments</h3>
        <ul>@for (s of p.customerSegments; track s) { <li>{{ s }}</li> }</ul>

        <h3>Personas</h3>
        @for (persona of p.personas; track persona.name) {
          <div class="card">
            <strong>{{ persona.name }}</strong> <span class="muted">({{ persona.role }})</span>
            <p>{{ persona.goals }}</p>
            <p class="muted">Frustrations: {{ persona.frustrations }}</p>
          </div>
        }

        <h3>Hypotheses <span class="muted">(all untested — no evidence collected yet)</span></h3>
        @for (h of hypotheses(); track h.id) {
          <div class="card">
            <span class="badge">{{ h.priority }}</span> {{ h.text }}
            <p class="muted">Status: Untested · {{ h.reason }}</p>
          </div>
        }

        <h3>Research Objectives <span class="muted">(your study plan — never shown to the interviewer)</span></h3>
        <ul>@for (r of p.researchObjectives; track r) { <li>{{ r }}</li> }</ul>

        <h3>Conversation Objectives <span class="muted">(the only thing the AI interviewer sees)</span></h3>
        <ul>@for (g of p.conversationObjectives; track g.id) { <li>{{ g.description }}</li> }</ul>

        <h3>Kill Criteria</h3>
        <ul>@for (k of p.killCriteria; track k) { <li>{{ k }}</li> }</ul>

        @if (resultSlug()) {
          <p class="success">Live! Open: <a [href]="'/i/' + resultSlug()">/i/{{ resultSlug() }}</a></p>
        } @else {
          <button (click)="approve()" [disabled]="approving()">
            {{ approving() ? 'Approving…' : 'Approve & Create Live Interview' }}
          </button>
        }
      </div>
    } @else {
      <p class="page">Loading…</p>
    }
  `,
  styles: [`
    .page { max-width: 640px; margin: 2rem auto; font-family: Roboto, sans-serif; padding: 0 1rem; }
    .muted { color: #777; font-size: 0.85rem; }
    .card { background: #f7f7fa; border-radius: 8px; padding: 0.75rem 1rem; margin: 0.5rem 0; }
    .badge { background: #6750a4; color: #fff; border-radius: 4px; padding: 0.1rem 0.5rem; font-size: 0.75rem; margin-right: 0.4rem; }
    button { padding: 0.7rem 1.2rem; border: none; background: #6750a4; color: #fff; border-radius: 6px; cursor: pointer; margin: 1rem 0 2rem; }
    .success { background: #e8f5e9; padding: 0.75rem 1rem; border-radius: 8px; }
  `],
})
export class DraftReviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly intake = inject(ProjectIntakeService);

  protected readonly project = signal<Project | undefined>(undefined);
  protected readonly hypotheses = signal<Array<Hypothesis & { id: string }>>([]);
  protected readonly approving = signal(false);
  protected readonly resultSlug = signal<string | null>(null);
  private projectId = '';

  async ngOnInit(): Promise<void> {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const [project, hypotheses] = await Promise.all([
      this.intake.getProject(this.projectId),
      this.intake.getHypotheses(this.projectId),
    ]);
    this.project.set(project);
    this.hypotheses.set(hypotheses);
  }

  async approve(): Promise<void> {
    this.approving.set(true);
    try {
      const { templateId } = await this.intake.approveDraft(this.projectId);
      const slug = await this.intake.getTemplateSlug(templateId);
      this.resultSlug.set(slug ?? null);
    } finally {
      this.approving.set(false);
    }
  }
}
