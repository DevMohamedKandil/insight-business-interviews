import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, firstValueFrom } from 'rxjs';

/** Document 6 §6. Real Firebase Auth for the admin surface — never anonymous,
 *  even though this is currently a single-operator tool (Assumption A1). The
 *  `admin` custom claim (see scripts/create-admin-user.ts locally) is what
 *  Firestore Rules and admin-only Cloud Functions actually check; this service
 *  only reads it back for route-guard UX (Document 11 §2 — not the security
 *  boundary itself). */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly auth = inject(Auth);

  readonly user = toSignal(user(this.auth), { initialValue: undefined });

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async isAdmin(): Promise<boolean> {
    const current = await firstValueFrom(user(this.auth).pipe(map((u) => u)));
    if (!current) return false;
    const tokenResult = await current.getIdTokenResult();
    return tokenResult.claims['admin'] === true;
  }

  async getIdToken(): Promise<string> {
    const current = await firstValueFrom(user(this.auth));
    if (!current) throw new Error('Not signed in.');
    return current.getIdToken();
  }
}
