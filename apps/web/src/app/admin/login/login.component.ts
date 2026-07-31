import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/auth/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <h2>InsightAI Admin</h2>
      <input [(ngModel)]="email" placeholder="Email" type="email" />
      <input [(ngModel)]="password" placeholder="Password" type="password" (keydown.enter)="submit()" />
      <button (click)="submit()" [disabled]="loading()">{{ loading() ? '...' : 'Sign In' }}</button>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .login { display: flex; flex-direction: column; gap: 0.75rem; max-width: 320px; margin: 15vh auto;
              font-family: Roboto, sans-serif; }
    input { padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; }
    button { padding: 0.6rem; border: none; background: #6750a4; color: #fff; border-radius: 6px; cursor: pointer; }
    .error { color: #b00020; font-size: 0.85rem; }
  `],
})
export class AdminLoginComponent {
  private readonly adminAuth = inject(AdminAuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.adminAuth.signIn(this.email, this.password);
      const isAdmin = await this.adminAuth.isAdmin();
      if (!isAdmin) {
        this.error.set('This account does not have admin access.');
        return;
      }
      await this.router.navigate(['/admin/idea-intake']);
    } catch {
      this.error.set('Sign-in failed. Check your email/password.');
    } finally {
      this.loading.set(false);
    }
  }
}
