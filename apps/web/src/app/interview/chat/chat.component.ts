import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InterviewService } from '../interview.service';

/**
 * Document 8 §2-3. Renders the chat surface: message bubbles, typing indicator,
 * streaming assistant text, and the closing state. Presentational only — all
 * session/streaming logic lives in `InterviewService` (Document 11 §5).
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat" [dir]="isRtl() ? 'rtl' : 'ltr'">
      <header class="chat__header">
        <div class="chat__progress" [attr.aria-label]="'Interview in progress'">
          @for (dot of progressDots(); track $index) {
            <span class="dot" [class.dot--filled]="dot"></span>
          }
        </div>
        <span class="chat__brand">InsightAI</span>
      </header>

      <div class="chat__body" #scrollAnchor aria-live="polite">
        @for (message of interview.messages(); track $index) {
          <div class="bubble" [class.bubble--assistant]="message.role === 'assistant'"
                                [class.bubble--respondent]="message.role === 'respondent'">
            {{ message.text }}
          </div>
        }

        @if (interview.streamingText()) {
          <div class="bubble bubble--assistant">{{ interview.streamingText() }}</div>
        }

        @if (interview.isAssistantTyping()) {
          <div class="bubble bubble--assistant typing">
            <span></span><span></span><span></span>
          </div>
        }

        @if (interview.lastErrorText(); as errorText) {
          <div class="error-banner">{{ errorText }}</div>
        }
      </div>

      <footer class="chat__footer">
        @if (interview.status() === 'active') {
          <input
            [(ngModel)]="draft"
            (keydown.enter)="submit()"
            [placeholder]="placeholderText()"
            [disabled]="interview.isAssistantTyping()"
          />
          <button (click)="submit()" [disabled]="!draft.trim() || interview.isAssistantTyping()">➤</button>
        } @else {
          <p class="closing">{{ interview.closingMessage() ?? 'Thank you!' }}</p>
        }
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100dvh; }
    .chat { display: flex; flex-direction: column; height: 100%; max-width: 480px; margin: 0 auto;
            font-family: Roboto, sans-serif; background: #fff; }
    .chat__header { display: flex; align-items: center; justify-content: space-between;
                    padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
    .chat__progress { display: flex; gap: 4px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #ddd; }
    .dot--filled { background: #6750a4; }
    .chat__brand { font-weight: 600; color: #6750a4; font-size: 0.9rem; }
    .chat__body { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .bubble { max-width: 78%; padding: 0.6rem 0.9rem; border-radius: 14px; line-height: 1.35; white-space: pre-wrap; }
    .bubble--assistant { align-self: flex-start; background: #f1f0f6; color: #222; border-bottom-left-radius: 4px; }
    .bubble--respondent { align-self: flex-end; background: #6750a4; color: #fff; border-bottom-right-radius: 4px; }
    .typing { display: flex; gap: 4px; align-items: center; }
    .typing span { width: 6px; height: 6px; border-radius: 50%; background: #999; animation: pulse 1s infinite ease-in-out; }
    .typing span:nth-child(2) { animation-delay: 0.15s; }
    .typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
    .chat__footer { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid #eee; }
    .chat__footer input { flex: 1; padding: 0.6rem 0.9rem; border-radius: 20px; border: 1px solid #ddd; outline: none; }
    .chat__footer button { border: none; background: #6750a4; color: #fff; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; }
    .chat__footer button:disabled { background: #ccc; cursor: default; }
    .closing { color: #666; font-size: 0.9rem; margin: 0 auto; }
    .error-banner { align-self: center; background: #fdecea; color: #b00020; font-size: 0.85rem;
                     padding: 0.5rem 0.9rem; border-radius: 8px; text-align: center; }
  `],
})
export class ChatComponent {
  protected readonly interview = inject(InterviewService);
  protected draft = '';
  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');

  constructor() {
    // Auto-scroll to the latest message/stream on every update (Document 8 §2's
    // "feels alive" requirement — a chat that doesn't follow the conversation reads
    // as broken, not calm).
    effect(() => {
      this.interview.messages();
      this.interview.streamingText();
      const el = this.scrollAnchor()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  /** Found via real-browser validation audit (Phase 2): an Arabic interview was
   *  rendering left-to-right with an English placeholder — a first-impression
   *  mismatch for exactly the audience being tested. RTL language codes per
   *  BCP-47 (Document 5 §1's `language` field). */
  private static readonly RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

  protected isRtl(): boolean {
    return ChatComponent.RTL_LANGUAGES.has(this.interview.language());
  }

  protected placeholderText(): string {
    return this.isRtl() ? 'اكتب رسالتك…' : 'Type your message…';
  }

  protected progressDots() {
    // Soft, ambiguous progress (Document 8 §1 principle #2) — never a literal
    // fraction. Approximated from turn count against a typical template's maxTurns.
    const turnCount = this.interview.messages().filter((m) => m.role === 'respondent').length;
    const total = 10;
    return Array.from({ length: total }, (_, i) => i < turnCount);
  }

  protected submit(): void {
    const text = this.draft.trim();
    if (!text) return;
    this.draft = '';
    void this.interview.send(text);
  }
}
