import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { BUSINESS_ROLES, bestBusinessRole, type BusinessRole } from '../../core/auth/roles';
import { LocaleSwitcher } from '../../shared/components/locale-switcher/locale-switcher.component';
import { DashboardService } from '../../features/dashboard/services/dashboard.service';
import { TenantMembership } from '../../core/http/api-mappers';

type PanelId = 'owner' | 'professional' | 'client' | 'admin';

interface MenuLink {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    TranslatePipe,
    LocaleSwitcher,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav mode="side" opened class="shell__sidenav">
        <a class="shell__brand" routerLink="/" [attr.aria-label]="'common.back_home' | translate">
          <span class="shell__mark">R</span>
          <span class="shell__name">ReservaYa</span>
        </a>
        <mat-nav-list class="shell__menu">
          @for (link of visibleLinks(); track link.route) {
            <a
              mat-list-item
              [routerLink]="link.route"
              routerLinkActive="shell__active"
              [routerLinkActiveOptions]="{ exact: link.route.endsWith('/owner') }"
            >
              <mat-icon matListItemIcon>{{ link.icon }}</mat-icon>
              <span matListItemTitle>{{ link.label | translate }}</span>
            </a>
          }
        </mat-nav-list>

        <div class="shell__footer">
          <button mat-stroked-button class="shell__logout" (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>{{ 'dashboard.logout' | translate }}</span>
          </button>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        <mat-toolbar class="shell__toolbar">
          <span class="shell__role">
            {{ roleLabel() | translate }}
          </span>

          @if (isBusinessPanel()) {
            @if (allBusinesses().length > 1) {
              <button mat-button [matMenuTriggerFor]="bizMenu" class="shell__biz">
                <mat-icon>storefront</mat-icon>
                <span class="shell__biz-name">{{ activeBusiness()?.name }}</span>
                <mat-icon class="shell__biz-caret">arrow_drop_down</mat-icon>
              </button>
              <mat-menu #bizMenu="matMenu" xPosition="after">
                @for (biz of allBusinesses(); track biz.tenantId) {
                  <button mat-menu-item (click)="switchTenant(biz)">
                    <mat-icon>
                      {{ biz.tenantId === activeBusiness()?.tenantId ? 'check' : 'storefront' }}
                    </mat-icon>
                    <span>{{ biz.name }}</span>
                    <span class="shell__biz-role">{{ ('dashboard.business_role_' + biz.role) | translate }}</span>
                  </button>
                }
              </mat-menu>
            } @else if (activeBusiness(); as biz) {
              <span class="shell__biz shell__biz--static">
                <mat-icon>storefront</mat-icon>
                <span class="shell__biz-name">{{ biz.name }}</span>
              </span>
            }
          }

          <div class="shell__spacer"></div>
          <button mat-button routerLink="/" class="shell__home">
            <mat-icon>home</mat-icon>
            <span>{{ 'common.back_home' | translate }}</span>
          </button>
          <app-locale-switcher />
          <button mat-icon-button [matMenuTriggerFor]="userMenu" aria-label="Usuario">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <button mat-menu-item disabled>
              <mat-icon>person</mat-icon>
              <span>{{ displayName() ?? 'user@reserwaya.io' }}</span>
            </button>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>{{ 'dashboard.logout' | translate }}</span>
            </button>
          </mat-menu>
        </mat-toolbar>

        <main class="shell__page">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
    }

    .shell__sidenav {
      width: 260px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--mat-sys-outline-variant);
    }

    .shell__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 16px;
      text-decoration: none;
      color: inherit;
    }

    .shell__mark {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
    }

    .shell__name {
      font-weight: 700;
      font-size: 18px;
    }

    .shell__menu {
      flex: 1;
      padding-top: 8px;
    }

    .shell__active {
      background: var(--mat-sys-secondary-container);
    }

    .shell__footer {
      padding: 16px;
    }

    .shell__logout {
      width: 100%;
    }

    .shell__content {
      display: flex;
      flex-direction: column;
    }

    .shell__toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .shell__role {
      font-weight: 600;
      text-transform: capitalize;
    }

    .shell__biz {
      margin-left: 16px;
      border-radius: 24px;
    }

    .shell__biz--static {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 16px;
      padding: 4px 10px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 24px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }

    .shell__biz-name {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .shell__biz-caret {
      opacity: 0.7;
    }

    .shell__biz-role {
      margin-left: auto;
      padding-left: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      opacity: 0.6;
    }

    .shell__spacer {
      flex: 1;
    }

    .shell__page {
      padding: 24px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  protected readonly displayName = computed(() => this.auth.session().name);

  protected readonly allBusinesses = signal<TenantMembership[]>([]);
  protected readonly activeBusiness = signal<TenantMembership | null>(null);
  protected readonly panel = signal<PanelId>('client');

  protected readonly visibleLinks = computed<MenuLink[]>(() => MENU[this.panel()]);
  protected readonly roleLabel = computed(() => {
    switch (this.panel()) {
      case 'admin':
        return 'dashboard.role_admin';
      case 'owner':
        return 'dashboard.role_owner';
      case 'professional':
        return 'dashboard.role_professional';
      default:
        return 'dashboard.role_client';
    }
  });
  protected readonly isBusinessPanel = computed(
    () => this.panel() === 'owner' || this.panel() === 'professional',
  );

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((e) => this.syncPanel(e.urlAfterRedirects));
    this.syncPanel(this.router.url);
    this.loadPanelTenants();
  }

  /**
   * El desplegable de negocios se resuelve por el ROL del panel actual:
   * dueño → solo negocios que administra; profesional → solo negocios donde
   * trabaja; cliente/admin → sin desplegable (el panel de cliente es global).
   */
  private loadPanelTenants(): void {
    const panel = this.panel();
    if (panel === 'owner') {
      this.dashboard.myTenants('owner').subscribe((list) => this.applyTenants(list));
    } else if (panel === 'professional') {
      this.dashboard.myTenants('professional').subscribe((list) => this.applyTenants(list));
    } else {
      this.applyTenants([]);
    }
  }

  private applyTenants(list: TenantMembership[]): void {
    this.allBusinesses.set(list);
    const stored = this.dashboard.storedActiveTenant();
    this.activeBusiness.set(
      list.find((b) => b.tenantId === stored) ?? list[0] ?? null,
    );
  }

  private syncPanel(url: string): void {
    const next =
      url.startsWith('/app/owner')
        ? 'owner'
        : url.startsWith('/app/professional')
          ? 'professional'
          : url.startsWith('/app/admin')
            ? 'admin'
            : 'client';
    if (next !== this.panel()) {
      this.panel.set(next);
      this.loadPanelTenants();
    }
  }

  switchTenant(biz: TenantMembership): void {
    this.dashboard.selectActiveTenant(biz.tenantId);
    this.activeBusiness.set(biz);
    void this.router.navigate([defaultRouteFor(bestBusinessRole(biz.roles))]);
  }

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        void this.auth.login().subscribe();
      }
    });
  }

  logout(): void {
    this.dashboard.invalidateTenants();
    this.auth.logout();
  }
}

function defaultRouteFor(role: BusinessRole): string {
  if (role === BUSINESS_ROLES.OWNER) return '/app/owner';
  if (role === BUSINESS_ROLES.PROFESSIONAL) return '/app/professional';
  return '/app/client';
}

const MENU: Record<PanelId, MenuLink[]> = {
  owner: [
    { label: 'dashboard.menu_overview', route: '/app/owner', icon: 'dashboard' },
    { label: 'dashboard.menu_appointments', route: '/app/owner/citas', icon: 'event_note' },
    { label: 'dashboard.menu_payments', route: '/app/owner/pagos', icon: 'payments' },
    { label: 'dashboard.menu_services', route: '/app/owner/services', icon: 'content_cut' },
    { label: 'dashboard.menu_professionals', route: '/app/owner/professionals', icon: 'groups' },
    { label: 'dashboard.menu_reports', route: '/app/owner/reports', icon: 'assessment' },
  ],
  professional: [
    { label: 'dashboard.menu_my_schedule', route: '/app/professional', icon: 'schedule' },
  ],
  client: [
    { label: 'dashboard.menu_upcoming', route: '/app/client', icon: 'event_note' },
    { label: 'dashboard.menu_my_payments', route: '/app/client/pagos', icon: 'payments' },
    { label: 'dashboard.menu_history', route: '/app/reservas', icon: 'history' },
  ],
  admin: [
    { label: 'dashboard.menu_tenants', route: '/app/admin', icon: 'storefront' },
  ],
};