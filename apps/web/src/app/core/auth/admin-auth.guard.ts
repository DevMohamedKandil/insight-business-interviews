import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

/** Document 11 §2: UX convenience only — the real boundary is Firestore Rules
 *  (`isAdmin()`) and the `requireAdmin()` check inside every admin Cloud Function.
 *  This guard just avoids flashing admin UI before redirecting to login. */
export const adminAuthGuard: CanActivateFn = async () => {
  const adminAuth = inject(AdminAuthService);
  const router = inject(Router);
  const isAdmin = await adminAuth.isAdmin();
  return isAdmin ? true : router.parseUrl('/admin/login');
};
