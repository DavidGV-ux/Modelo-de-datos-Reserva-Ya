import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * OIDC redirect callback page (`/auth/callback?code&state`).
 *
 * Instantiates `AuthService` so the authorization code + PKCE exchange actually
 * runs: previously the route only did `redirectTo: '/'` and nothing guaranteed
 * `AuthService` (lazy, root `providedIn`) was constructed, so the code was
 * silently dropped and the login never completed.
 */
@Component({
  selector: 'app-auth-callback',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.auth.ready.then(() => this.router.navigateByUrl('/'));
  }
}