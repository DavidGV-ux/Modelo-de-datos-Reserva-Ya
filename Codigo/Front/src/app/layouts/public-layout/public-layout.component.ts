import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleSwitcher } from '../../shared/components/locale-switcher/locale-switcher.component';
import { TenantService, tenantSlugFromSnapshot } from '../../features/public-portal/services/tenant.service';

@Component({
  selector: 'app-public-layout',
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
    <mat-sidenav-container class="portal">
      <mat-sidenav #snav mode="over" class="portal__sidenav" opened="false">
        <div class="portal__sidenav-header">
          <span class="portal__mark">{{ brandInitial() }}</span>
          <strong>{{ tenant()?.name }}</strong>
        </div>
        <mat-divider />
        <nav class="portal__sidenav-links">
          @for (link of navLinks; track link.fragment) {
            <a
              mat-button
              [routerLink]="['/', tenant()?.slug]"
              [fragment]="link.fragment"
              (click)="snav.close()"
            >
              {{ link.label | translate }}
            </a>
          }
          <a
            mat-button
            [routerLink]="['/', tenant()?.slug, 'mi-historial']"
            (click)="snav.close()"
          >
            {{ 'header.my_appointments' | translate }}
          </a>
          <a mat-flat-button [routerLink]="['/', tenant()?.slug, 'reservar']" (click)="snav.close()">
            {{ 'common.book' | translate }}
          </a>
        </nav>
      </mat-sidenav>

      <mat-sidenav-content>
        <header class="portal__header">
          <div class="portal__header-inner">
            <button mat-icon-button class="portal__menu" (click)="snav.open()" aria-label="Menu">
              <mat-icon>menu</mat-icon>
            </button>

            <a class="portal__brand" [routerLink]="['/', tenant()?.slug]">
              <span class="portal__mark">{{ brandInitial() }}</span>
              <span class="portal__name">{{ tenant()?.name }}</span>
            </a>

            <nav class="portal__nav">
              @for (link of navLinks; track link.fragment) {
                <a
                  mat-button
                  [routerLink]="['/', tenant()?.slug]"
                  [fragment]="link.fragment"
                  routerLinkActive="portal__nav-active"
                >
                  {{ link.label | translate }}
                </a>
              }
              <a
                mat-button
                [routerLink]="['/', tenant()?.slug, 'servicios']"
                routerLinkActive="portal__nav-active"
              >
                {{ 'header.nav_services' | translate }}
              </a>
            </nav>

            <div class="portal__actions">
              <app-locale-switcher />
              <a
                mat-stroked-button
                [routerLink]="['/', tenant()?.slug, 'mi-historial']"
                class="portal__login"
              >
                <mat-icon>person_outline</mat-icon>
                <span>{{ 'header.my_appointments' | translate }}</span>
              </a>
              <a mat-flat-button [routerLink]="['/', tenant()?.slug, 'reservar']" class="portal__cta">
                {{ 'common.book' | translate }}
              </a>
            </div>
          </div>
        </header>

        <main class="portal__content">
          <router-outlet />
        </main>

        <footer class="portal__footer">
          <div class="portal__footer-inner">
            <div>
              <div class="portal__footer-brand">
                <span class="portal__mark">{{ brandInitial() }}</span>
                <strong>{{ tenant()?.name }}</strong>
              </div>
              <p class="portal__footer-about">{{ 'footer.about' | translate }}</p>
            </div>
            <div class="portal__footer-meta">
              <span>{{ tenant()?.address }}</span>
              <span>{{ tenant()?.phone }}</span>
              <span>© {{ year }} {{ tenant()?.name }}. {{ 'footer.rights' | translate }}</span>
              <span class="portal__footer-link">{{ 'footer.privacy' | translate }} · {{ 'footer.habeas' | translate }}</span>
            </div>
          </div>
        </footer>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .portal {
      height: 100vh;
    }

    .portal__sidenav {
      width: 280px;
      padding: 12px;
    }

    .portal__sidenav-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
    }

    .portal__sidenav-links {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 12px;

      & a {
        justify-content: flex-start;
      }
    }

    .portal__header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: color-mix(in srgb, var(--mat-sys-surface) 88%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .portal__header-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 8px 20px;
      display: flex;
      align-items: center;
      gap: 24px;
      min-height: 64px;
    }

    .portal__menu {
      @media (min-width: 800px) {
        display: none;
      }
    }

    .portal__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }

    .portal__mark {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 20px;
      flex: none;
    }

    .portal__name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .portal__nav {
      display: none;
      align-items: center;
      gap: 4px;
      flex: 1;

      @media (min-width: 800px) {
        display: flex;
        margin-left: 12px;
      }
    }

    .portal__nav-active {
      background: var(--mat-sys-secondary-container, transparent);
    }

    .portal__actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .portal__login {
      display: none;

      @media (min-width: 640px) {
        display: inline-flex;
      }
    }

    .portal__content {
      min-height: calc(100vh - 220px);
    }

    .portal__footer {
      margin-top: 48px;
      background: var(--mat-sys-surface-container);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .portal__footer-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;

      @media (min-width: 800px) {
        grid-template-columns: 2fr 1fr;
      }
    }

    .portal__footer-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 18px;
    }

    .portal__footer-about {
      color: var(--mat-sys-on-surface-variant);
      margin: 12px 0 0;
      max-width: 480px;
    }

    .portal__footer-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }

    .portal__footer-link {
      color: var(--mat-sys-primary);
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayout implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);

  protected readonly tenant = this.tenants.currentTenant;
  protected readonly brandInitial = computed(() => (this.tenant()?.name ?? 'R').charAt(0).toUpperCase());
  protected readonly year = new Date().getFullYear();

  protected readonly navLinks = [
    { label: 'header.nav_services', fragment: 'servicios' },
    { label: 'header.nav_team', fragment: 'equipo' },
    { label: 'header.nav_hours', fragment: 'horarios' },
  ];

  ngOnInit(): void {
    const slug = tenantSlugFromSnapshot(this.route.snapshot);
    if (slug) {
      this.tenants.resolve(slug).subscribe();
    }
  }
}