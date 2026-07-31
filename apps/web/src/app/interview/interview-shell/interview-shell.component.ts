import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InterviewService } from '../interview.service';
import { ChatComponent } from '../chat/chat.component';

/**
 * Document 8 §2-4 / Document 11 §5. Resolves `{templateSlug}` → starts (or resumes)
 * a session → renders either the chat surface or the unavailable-template state.
 * No guard on this route (Document 9 §2.1 — public by design).
 */
@Component({
  selector: 'app-interview-shell',
  standalone: true,
  imports: [ChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (interview.status() === 'unavailable') {
      <div class="unavailable">
        <div class="unavailable__icon">🌙</div>
        <h2>This conversation isn't available right now.</h2>
        <p>Check back later, or reach out to whoever shared this link with you.</p>
      </div>
    } @else if (interview.status() === 'idle') {
      <div class="loading">Loading…</div>
    } @else {
      <app-chat />
    }
  `,
  styles: [`
    :host { display: block; min-height: 100dvh; }
    .unavailable, .loading {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100dvh; text-align: center; padding: 2rem; gap: 0.75rem;
      font-family: Roboto, sans-serif; color: #444;
    }
    .unavailable__icon { font-size: 2.5rem; }
  `],
})
export class InterviewShellComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly interview = inject(InterviewService);
  protected readonly templateSlug = signal<string>('');

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('templateSlug') ?? '';
    this.templateSlug.set(slug);
    void this.interview.open(slug);
  }
}
