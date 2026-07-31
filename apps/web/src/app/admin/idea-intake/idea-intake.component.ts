import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectIntakeService } from '../project-intake.service';

/**
 * Build Now (this session): "Founder describes idea in plain language" — the
 * entry point of Idea Intake → Draft Generation → Founder Review → Auto Template
 * Generation. Deliberately minimal UI; the substance is the backend pipeline.
 */
@Component({
  selector: 'app-idea-intake',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h2>New Project</h2>
      <p class="hint">Describe your startup idea in a sentence or two — InsightAI will draft hypotheses, personas, and a ready-to-run interview for you to review.</p>
      <textarea [(ngModel)]="ideaText" rows="4" placeholder="I want to build..."></textarea>
      <button (click)="submit()" [disabled]="loading() || !ideaText.trim()">
        {{ loading() ? 'Generating draft…' : 'Generate Draft' }}
      </button>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 560px; margin: 4rem auto; font-family: Roboto, sans-serif; display: flex; flex-direction: column; gap: 0.75rem; }
    textarea { padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; font-family: inherit; resize: vertical; }
    button { padding: 0.7rem; border: none; background: #6750a4; color: #fff; border-radius: 6px; cursor: pointer; }
    button:disabled { background: #ccc; }
    .hint { color: #666; font-size: 0.9rem; }
    .error { color: #b00020; font-size: 0.85rem; }
  `],
})
export class IdeaIntakeComponent {
  private readonly intake = inject(ProjectIntakeService);
  private readonly router = inject(Router);

  protected ideaText = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { projectId } = await this.intake.generateDraft(this.ideaText.trim());
      await this.router.navigate(['/admin/draft-review', projectId]);
    } catch {
      this.error.set('Could not generate a draft. Check the OpenRouter key/logs and try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
