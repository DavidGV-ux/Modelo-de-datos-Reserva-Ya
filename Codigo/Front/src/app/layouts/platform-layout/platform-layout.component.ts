import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleSwitcher } from '../../shared/components/locale-switcher/locale-switcher.component';
import { AuthService } from '../../core/auth/auth.service';
import { BUSINESS_ROLES } from '../../core/auth/roles';
import { DashboardService } from '../../features/dashboard/services/dashboard.service';
import { PlatformService } from '../../features/platform/services/platform.service';
import { CompleteProfileDialog } from '../../features/platform/components/complete-profile-dialog/complete-profile-dialog.component';

@Component({
  selector: 'app-platform-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatDividerModule,
    TranslatePipe,
    LocaleSwitcher,
  ],
  template: `
    <mat-sidenav-container class="platform">
      <mat-sidenav #snav mode="over" class="platform__sidenav" opened="false">
        <div class="platform__sidenav-header">
          <span class="platform__mark">R</span>
          <strong>{{ 'common.appName' | translate }}</strong>
        </div>
        <mat-divider />
        <nav class="platform__sidenav-links">
          <a mat-button routerLink="/" (click)="snav.close()">{{ 'landing.how' | translate }}</a>
          <a mat-button routerLink="/crear-negocio" (click)="snav.close()">
            {{ 'landing.cta_own_business' | translate }}
          </a>
          @if (auth.isAuthenticated()) {
            @if (isOwner()) {
              <a mat-flat-button routerLink="/app/owner" (click)="snav.close()">
                {{ 'landing.go_owner_dashboard' | translate }}
              </a>
            }
            @if (isProfessional()) {
              <a mat-flat-button routerLink="/app/professional" (click)="snav.close()">
                {{ 'landing.go_professional_dashboard' | translate }}
              </a>
            }
            <a mat-stroked-button routerLink="/app/client" (click)="snav.close()">
              {{ 'landing.go_client_dashboard' | translate }}
            </a>
          } @else {
            <button mat-stroked-button (click)="login(); snav.close()">
              {{ 'common.login' | translate }}
            </button>
          }
        </nav>
      </mat-sidenav>

      <mat-sidenav-content>
        <header class="platform__header">
          <div class="platform__header-inner">
            <button mat-icon-button class="platform__menu" (click)="snav.open()" aria-label="Menu">
              <mat-icon>menu</mat-icon>
            </button>

            <a class="platform__brand" routerLink="/">
              <span class="platform__mark">R</span>
              <span class="platform__name">{{ 'common.appName' | translate }}</span>
            </a>

            <nav class="platform__nav">
              <a
                mat-button
                routerLink="/"
                fragment="como-funciona"
                routerLinkActive="platform__nav-active"
                [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'ignored', fragment: 'ignored' }"
              >
                {{ 'landing.how' | translate }}
              </a>
              <a
                mat-button
                routerLink="/"
                fragment="negocios"
                routerLinkActive="platform__nav-active"
                [routerLinkActiveOptions]="{ matrixParams: 'ignored', queryParams: 'ignored', fragment: 'ignored' }"
              >
                {{ 'landing.directory' | translate }}
              </a>
              <a mat-button routerLink="/crear-negocio">
                {{ 'landing.cta_own_business' | translate }}
              </a>
            </nav>

            <div class="platform__actions">
              <app-locale-switcher />
              @if (auth.isAuthenticated()) {
                @if (isOwner()) {
                  <button mat-flat-button routerLink="/app/owner" class="platform__cta">
                    <mat-icon>storefront</mat-icon>
                    <span>{{ 'landing.go_owner_dashboard' | translate }}</span>
                  </button>
                }
                @if (isProfessional()) {
                  <button mat-stroked-button routerLink="/app/professional" class="platform__cta">
                    <mat-icon>work</mat-icon>
                    <span>{{ 'landing.go_professional_dashboard' | translate }}</span>
                  </button>
                }
                <button mat-stroked-button routerLink="/app/client" class="platform__cta">
                  <mat-icon>person</mat-icon>
                  <span>{{ 'landing.go_client_dashboard' | translate }}</span>
                </button>
              } @else {
                <button mat-flat-button class="platform__cta" (click)="login()">
                  {{ 'common.login' | translate }}
                </button>
              }
            </div>
          </div>
        </header>

        <main class="platform__content">
          <router-outlet />
        </main>

        <footer class="platform__footer">
          <div class="platform__footer-inner">
            <div>
              <div class="platform__footer-brand">
                <span class="platform__mark">R</span>
                <strong>{{ 'common.appName' | translate }}</strong>
              </div>
              <p class="platform__footer-about">{{ 'footer.about' | translate }}</p>
            </div>
            <div class="platform__footer-meta">
              <span>{{ 'footer.rights' | translate }}</span>
              <a class="platform__footer-link" routerLink="/privacidad">
                {{ 'common.appName' | translate }} — {{ 'footer.privacy_full' | translate }}
              </a>
            </div>
          </div>
        </footer>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .platform {
      min-height: 100vh;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
    }
    .platform__sidenav {
      width: 280px;
    }
    .platform__sidenav-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px;
      font-size: 15px;
    }
    .platform__sidenav-links {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 12px;
    }
    .platform__header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .platform__header-inner {
      max-width: 1160px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
    }
    .platform__menu {
      display: none;
    }
    .platform__brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: inherit;
    }
    .platform__mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      font-weight: 800;
      color: var(--mat-sys-on-primary);
      background: var(--mat-sys-primary);
    }
    .platform__name {
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .platform__nav {
      display: flex;
      gap: 4px;
      margin-left: 12px;
    }
    .platform__actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .platform__content {
      min-height: calc(100vh - 137px);
    }

    .platform__footer {
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding: 28px 20px 36px;
    }
    .platform__footer-inner {
      max-width: 1160px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }
    .platform__footer-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .platform__footer-about {
      max-width: 380px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }
    .platform__footer-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
      align-items: flex-end;
    }
    .platform__footer-link {
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    .platform__footer-link:hover {
      text-decoration: underline;
    }

    @media (max-width: 860px) {
      .platform__menu {
        display: inline-flex;
      }
      .platform__nav {
        display: none;
      }
      .platform__brand .platform__name {
        display: none;
      }
      .platform__actions .platform__cta span {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformLayout {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly platform = inject(PlatformService);
  private readonly dashboard = inject(DashboardService);
  private profileChecked = false;
  private membershipsLoaded = false;

  /** El usuario es dueño de al menos un negocio (ve el panel de empresa). */
  protected readonly isOwner = signal(false);
  /** El usuario trabaja como profesional en algún negocio (ve su panel de agenda). */
  protected readonly isProfessional = signal(false);

  constructor() {
    // Las membresías se resuelven al autenticarse y se ocultan para clientes puros.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.membershipsLoaded = false;
        this.isOwner.set(false);
        this.isProfessional.set(false);
        return;
      }
      if (this.membershipsLoaded) return;
      this.membershipsLoaded = true;
      this.dashboard.myTenants().subscribe({
        next: (list) => {
          this.isOwner.set(list.some((m) => m.roles.includes(BUSINESS_ROLES.OWNER)));
          this.isProfessional.set(
            list.some((m) => m.roles.includes(BUSINESS_ROLES.PROFESSIONAL)),
          );
        },
        error: () => {
          this.membershipsLoaded = false;
        },
      });
    });

    // Cuando el usuario se autentica (incl. justo después de registrarse en la
    // misma sesión) verificamos si completó teléfono + ciudad. Si no, se le pide:
    // guardar su perfil dispara el envío del mensaje de bienvenida por WhatsApp.
    // Reacciona al cambio de sesión (effect sobre el signal), no solo al primer
    // render, para cubrir el registro/login posterior al cargado de la SPA.
    effect(() => {
      if (typeof window === 'undefined') return; // no abrir diálogos en SSR
      if (!this.auth.isAuthenticated()) return;
      if (this.profileChecked) return; // una sola vez por sesión
      this.profileChecked = true;
      this.checkProfile();
    });
  }

  private checkProfile(): void {
    this.platform.meProfile().subscribe({
      next: (profile) => {
        // Tras el registro pedimos teléfono + ciudad (habilita el WhatsApp de ReservaYa).
        if (!profile?.phone || !profile?.city) {
          this.dialog.open(CompleteProfileDialog, { width: '460px', maxWidth: '92vw' });
        }
      },
      error: () => {
        // Si el perfil no es consultable (sesión caducada), no bloqueamos la navegación.
      },
    });
  }

  protected login(): void {
    void this.auth.login().subscribe((ok) => {
      if (ok) void this.router.navigateByUrl('/');
    });
  }
}