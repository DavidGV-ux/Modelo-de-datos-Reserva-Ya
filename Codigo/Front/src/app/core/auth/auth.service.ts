import { Injectable, inject, signal } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { from, map, Observable } from 'rxjs';
import { authConfig } from './auth.config';
import { UserRole } from './roles';
import { environment } from '../config/environment';

interface RoleClaims {
  realm_access?: { roles?: string[] };
  roles?: string[];
  resource_access?: Record<string, { roles?: string[] }>;
  tenant_id?: string;
  expected_roles?: string[];
  given_name?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
}

export interface SessionProfile {
  roles: UserRole[];
  tenantIds: string[];
  name: string | null;
  email: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oauth = inject(OAuthService);

  private readonly isAuthed = signal(false);
  private readonly profile = signal<SessionProfile>({
    roles: [],
    tenantIds: [],
    name: null,
    email: null,
  });

  readonly isAuthenticated = this.isAuthed.asReadonly();
  readonly session = this.profile.asReadonly();

  /**
   * Resolves once the OIDC discovery + callback processing (`tryLogin`) finishes,
   * so the `/auth/callback` page can redirect right after the code exchange.
   */
  readonly ready: Promise<void>;

  constructor() {
    this.oauth.configure(authConfig(environment.keycloak));
    this.oauth.setupAutomaticSilentRefresh();
    this.ready = this.tryLogin();
  }

  private tryLogin(): Promise<void> {
    return this.oauth
      .loadDiscoveryDocumentAndTryLogin()
      .then(() => this.refreshState())
      .catch(() => this.isAuthed.set(false));
  }

  get hasAccessToken(): boolean {
    return this.oauth.hasValidAccessToken();
  }

  login(): Observable<boolean> {
    return from(this.oauth.loadDiscoveryDocumentAndLogin()).pipe(
      map((loggedIn) => {
        this.refreshState();
        return loggedIn;
      }),
    );
  }

  logout(): void {
    this.oauth.logOut();
    this.isAuthed.set(false);
    this.profile.set({ roles: [], tenantIds: [], name: null, email: null });
  }

  hasRole(role: UserRole): boolean {
    return this.profile().roles.includes(role);
  }

  hasAnyRole(roles: UserRole[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }

  get firstName(): string | null {
    const claims = this.claims();
    return (claims?.given_name as string) ?? null;
  }

  private claims(): RoleClaims | null {
    try {
      return (this.oauth.getIdentityClaims() as RoleClaims) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Keycloak 25+ no incluye realm_access en el id_token salvo que se añada un
   * mapper; se leen los roles también del access_token (siempre presentes).
   */
  private accessClaims(): RoleClaims | null {
    try {
      const token = this.oauth.getAccessToken();
      if (!token) return null;
      const part = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
      const pad = '='.repeat((4 - (part.length % 4)) % 4);
      const json = decodeURIComponent(escape(window.atob(part + pad)));
      return JSON.parse(json) as RoleClaims;
    } catch {
      return null;
    }
  }

  private refreshState(): void {
    const claims = this.claims();
    const access = this.accessClaims();
    if (!claims && !access) {
      this.isAuthed.set(false);
      return;
    }

    const roles = new Set<UserRole>([
      ...(claims?.realm_access?.roles ?? []),
      ...(claims?.roles ?? []),
      ...(claims?.resource_access?.[environment.keycloak.clientId]?.roles ?? []),
      ...(claims?.expected_roles ?? []),
      ...(access?.realm_access?.roles ?? []),
      ...(access?.roles ?? []),
      ...(access?.resource_access?.[environment.keycloak.clientId]?.roles ?? []),
    ] as UserRole[]);

    const tenantIds =
      (claims?.tenant_id ?? access?.tenant_id ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    this.isAuthed.set(true);
    this.profile.set({
      roles: [...roles],
      tenantIds,
      name:
        claims?.name ||
        claims?.preferred_username ||
        access?.name ||
        access?.preferred_username ||
        null,
      email: claims?.email ?? access?.email ?? null,
    });
  }
}