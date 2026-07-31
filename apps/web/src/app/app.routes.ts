import { Routes } from '@angular/router';

/** Document 11 §2 (superseded note): the admin subtree was deferred to Phase 2 in
 *  the original plan, but the Idea Intake Build Now increment (this session)
 *  needed a minimal admin surface now — see admin/admin.routes.ts. The full
 *  Dashboard/Templates/Sessions/Analytics Admin Panel from Document 8 §6-8 is
 *  still Phase 2; only login + idea-intake + draft-review exist so far. */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'i/:templateSlug',
    loadComponent: () =>
      import('./interview/interview-shell/interview-shell.component').then((m) => m.InterviewShellComponent),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
