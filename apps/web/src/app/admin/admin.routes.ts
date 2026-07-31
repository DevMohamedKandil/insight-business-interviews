import { Routes } from '@angular/router';
import { adminAuthGuard } from '../core/auth/admin-auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'idea-intake',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./idea-intake/idea-intake.component').then((m) => m.IdeaIntakeComponent),
  },
  {
    path: 'draft-review/:projectId',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./draft-review/draft-review.component').then((m) => m.DraftReviewComponent),
  },
  { path: '', redirectTo: 'idea-intake', pathMatch: 'full' },
];
