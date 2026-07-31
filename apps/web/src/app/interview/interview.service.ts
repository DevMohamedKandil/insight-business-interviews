import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AnonymousAuthService } from '../core/auth/anonymous-auth.service';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'assistant' | 'respondent';
  text: string;
}

type SessionStatus = 'idle' | 'active' | 'completed' | 'abandoned' | 'unavailable';

/**
 * Document 11 §3/§5. Thin client-side service: calls `sendMessage`/`startSession`/
 * `resumeSession`, exposes Signals for the `chat` component to render — it is the
 * only place `libs/shared-types`-shaped data is handled client-side (Document 11 §5).
 */
@Injectable({ providedIn: 'root' })
export class InterviewService {
  private readonly functions = inject(Functions);
  private readonly anonAuth = inject(AnonymousAuthService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly streamingText = signal<string>('');
  readonly isAssistantTyping = signal(false);
  readonly status = signal<SessionStatus>('idle');
  readonly closingMessage = signal<string | null>(null);
  readonly language = signal<string>('en');
  /** Document 9 §2.2's mid-stream error case — was designed but never actually
   *  surfaced to the respondent (found via real-browser validation audit): the
   *  typing indicator just vanished with no feedback. This is that fix. */
  readonly lastErrorText = signal<string | null>(null);

  private sessionId: string | null = null;

  private resumeTokenKey(templateSlug: string): string {
    return `insightai:resumeToken:${templateSlug}`;
  }

  async open(templateSlug: string): Promise<void> {
    await this.anonAuth.ensureSignedIn();
    const existingToken = localStorage.getItem(this.resumeTokenKey(templateSlug));

    try {
      if (existingToken) {
        await this.resume(existingToken, templateSlug);
      } else {
        await this.start(templateSlug);
      }
    } catch {
      this.status.set('unavailable');
    }
  }

  private async start(templateSlug: string): Promise<void> {
    const callable = httpsCallable<{ templateSlug: string }, {
      sessionId: string; resumeToken: string; welcomeMessage: string; language: string;
    }>(this.functions, 'startSession');

    const { data } = await callable({ templateSlug });
    this.sessionId = data.sessionId;
    localStorage.setItem(this.resumeTokenKey(templateSlug), data.resumeToken);
    this.language.set(data.language);
    this.messages.set([{ role: 'assistant', text: data.welcomeMessage }]);
    this.status.set('active');
  }

  private async resume(resumeToken: string, templateSlug: string): Promise<void> {
    const callable = httpsCallable<{ resumeToken: string }, {
      sessionId: string; templateSlug: string; language: string; status: string;
      messages: Array<{ role: string; text: string }>;
    }>(this.functions, 'resumeSession');

    try {
      const { data } = await callable({ resumeToken });
      this.sessionId = data.sessionId;
      this.language.set(data.language);
      this.messages.set(data.messages.map((m) => ({ role: m.role as 'assistant' | 'respondent', text: m.text })));
      this.status.set(data.status === 'active' ? 'active' : (data.status as SessionStatus));
    } catch {
      // Resume token invalid/expired — fall back to starting fresh rather than
      // stranding the respondent (Document 9 §2.3's error handling intent).
      localStorage.removeItem(this.resumeTokenKey(templateSlug));
      await this.start(templateSlug);
    }
  }

  async send(text: string): Promise<void> {
    if (!this.sessionId || this.status() !== 'active') return;

    this.messages.update((current) => [...current, { role: 'respondent', text }]);
    this.isAssistantTyping.set(true);
    this.lastErrorText.set(null);
    // Document 8 §2: deliberate pacing delay so the reply never feels instantaneous.
    await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));

    try {
      const idToken = await this.anonAuth.getIdToken();
      const response = await fetch(environment.sendMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sessionId: this.sessionId, text }),
      });

      if (!response.ok || !response.body) {
        this.isAssistantTyping.set(false);
        this.lastErrorText.set('Connection lost, one moment — try sending that again.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      this.streamingText.set('');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'token') {
            this.isAssistantTyping.set(false);
            this.streamingText.update((t) => t + event.value);
          } else if (event.type === 'done') {
            this.messages.update((current) => [...current, { role: 'assistant', text: this.streamingText() }]);
            this.streamingText.set('');
            if (event.sessionStatus === 'completed' || event.sessionStatus === 'abandoned') {
              this.status.set(event.sessionStatus);
              this.closingMessage.set(event.closingMessage ?? null);
            }
          } else if (event.type === 'error') {
            // Document 9 §2.2: never silently truncate — the respondent must see
            // *something* explaining the conversation didn't just stop on its own.
            this.isAssistantTyping.set(false);
            this.streamingText.set('');
            this.lastErrorText.set('Connection lost, one moment — try sending that again.');
          }
        }
      }
    } catch {
      this.isAssistantTyping.set(false);
      this.lastErrorText.set('Connection lost, one moment — try sending that again.');
    }
  }
}
