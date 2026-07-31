import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Minimal marketing entry point (new scope item from this session's re-brief —
 * "Founder OS / InsightAI"). Deliberately lightweight: the product's real substance
 * is the interview experience, not this page. Full landing-page design is not a
 * Phase 1 architectural concern (Document 12) — this exists just so the app has
 * a sensible `/` route instead of a redirect to nowhere.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="landing">
      <h1>InsightAI</h1>
      <p>Replace surveys with real conversations.</p>
      <p class="hint">Open a template link (e.g. <code>/i/doctors-egypt</code>) to try an interview.</p>
    </div>
  `,
  styles: [`
    .landing { display: flex; flex-direction: column; align-items: center; justify-content: center;
               min-height: 100dvh; font-family: Roboto, sans-serif; text-align: center; gap: 0.5rem; }
    h1 { color: #6750a4; margin-bottom: 0; }
    .hint { color: #888; font-size: 0.85rem; }
    code { background: #f1f0f6; padding: 0.1rem 0.4rem; border-radius: 4px; }
  `],
})
export class LandingComponent {}
