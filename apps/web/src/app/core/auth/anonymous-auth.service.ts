import { Injectable, inject } from '@angular/core';
import { Auth, signInAnonymously, signOut, user } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

/**
 * Document 7 §4 (core/auth). Ensures every respondent has an anonymous Firebase
 * Auth session before any Callable/HTTPS function call (Document 6's whole security
 * model assumes `request.auth` is always present).
 *
 * BUG FIX (found via release-readiness audit, real browser test): this previously
 * returned ANY currently-signed-in user's uid, anonymous or not. If a founder opened
 * a respondent interview link in the same browser tab right after using the Admin
 * Panel (a realistic scenario, not a hypothetical), the interview session was
 * attributed to the founder's real admin identity instead of a fresh anonymous one
 * — confirmed directly in Firestore (`session.respondentUid` matched the admin's
 * uid). Root-caused and fixed here, in code — not "use an incognito window."
 */
@Injectable({ providedIn: 'root' })
export class AnonymousAuthService {
  private readonly auth = inject(Auth);

  async ensureSignedIn(): Promise<string> {
    const current = await firstValueFrom(user(this.auth));
    if (current?.isAnonymous) return current.uid;
    if (current && !current.isAnonymous) {
      // A non-anonymous (e.g. admin) identity is active in this browser — never let
      // a respondent session inherit it. Sign out first, then start fresh.
      await signOut(this.auth);
    }
    const credential = await signInAnonymously(this.auth);
    return credential.user.uid;
  }

  async getIdToken(): Promise<string> {
    const current = await firstValueFrom(user(this.auth));
    if (!current) throw new Error('Not signed in yet — call ensureSignedIn() first.');
    return current.getIdToken();
  }
}
