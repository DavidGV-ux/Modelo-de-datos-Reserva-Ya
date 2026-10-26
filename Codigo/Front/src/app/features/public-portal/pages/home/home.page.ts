import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../../../core/seo/seo.service';
import { TenantService, tenantSlugFromSnapshot } from '../../services/tenant.service';
import { PortalDataService } from '../../services/portal-data.service';
import { Professional, Service } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <section class="hero">
      <div class="hero__inner">
        <span class="hero__badge">ReservaYa</span>
        <h1 class="hero__title">{{ tenant()?.tagline }}</h1>
        <p class="hero__subtitle">{{ 'home.hero_subtitle' | translate }}</p>
        <div class="hero__actions">
          <a mat-flat-button size="large" [routerLink]="['/', tenant()?.slug, 'reservar']">
            {{ 'home.hero_cta' | translate }}
          </a>
          <a mat-stroked-button [routerLink]="['/', tenant()?.slug, 'servicios']">
            {{ 'header.nav_services' | translate }}
          </a>
        </div>

        <dl class="hero__stats">
          <div class="hero__stat">
            <dt>{{ 'home.stats_appointments' | translate }}</dt>
            <dd>1.2k+</dd>
          </div>
          <div class="hero__stat">
            <dt>{{ 'home.stats_professionals' | translate }}</dt>
            <dd>{{ professionals().length }}</dd>
          </div>
          <div class="hero__stat">
            <dt>{{ 'home.stats_satisfaction' | translate }}</dt>
            <dd>4.9★</dd>
          </div>
        </dl>
      </div>
    </section>

    <section id="servicios" class="section">
      <div class="section__head">
        <h2>{{ 'home.services_title' | translate }}</h2>
        <p>{{ 'home.services_subtitle' | translate }}</p>
      </div>
      <div class="services-grid">
        @for (service of services(); track service.id) {
          <mat-card class="service-card">
            <mat-card-header>
              <mat-card-title>{{ service.name }}</mat-card-title>
              <mat-card-subtitle>{{ service.durationMinutes }} {{ 'common.minutes' | translate }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <p>{{ service.description }}</p>
            </mat-card-content>
            <mat-card-actions align="end">
              <span class="service-card__price">{{ service.price | appMoney: tenant()?.currency }}</span>
              <button mat-raised-button [routerLink]="['/', tenant()?.slug, 'reservar']" [queryParams]="{ servicio: service.id }">
                {{ 'services.book' | translate }}
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
      <div class="section__cta">
        <a mat-stroked-button [routerLink]="['/', tenant()?.slug, 'servicios']">
          {{ 'home.view_all' | translate }}
        </a>
      </div>
    </section>

    <section id="equipo" class="section section--tint">
      <div class="section__head">
        <h2>{{ 'home.team_title' | translate }}</h2>
        <p>{{ 'home.team_subtitle' | translate }}</p>
      </div>
      <div class="team-grid">
        @for (professional of professionals(); track professional.id) {
          <div class="team-card">
            <span class="team-card__avatar">{{ professional.name.charAt(0) }}</span>
            <strong>{{ professional.name }}</strong>
            <span>{{ professional.title }}</span>
          </div>
        }
      </div>
    </section>

    <section id="horarios" class="section">
      <div class="section__head">
        <h2>{{ 'home.hours_title' | translate }}</h2>
      </div>
      <div class="hours-card">
        <div class="hours-card__row">
          <span>{{ 'header.nav_hours' | translate }}</span>
          <span>Lun – Vie 9:00 AM – 8:00 PM · Sáb 9:00 AM – 8:00 PM</span>
        </div>
        <div class="hours-card__row">
          <span>{{ 'common.language' | translate }}</span>
          <span>ES / EN · {{ tenant()?.currency }}</span>
        </div>
        <div class="hours-card__row">
          <span>{{ 'home.hours_title' | translate }}</span>
          <span>{{ tenant()?.address }}</span>
        </div>
      </div>
    </section>

    <section class="how">
      <div class="section__head">
        <h2>{{ 'home.how_title' | translate }}</h2>
      </div>
      <div class="how__steps">
        <div class="how__step">
          <mat-icon>content_cut</mat-icon>
          <span>{{ 'home.how_step1' | translate }}</span>
        </div>
        <mat-icon class="how__arrow">arrow_forward</mat-icon>
        <div class="how__step">
          <mat-icon>calendar_today</mat-icon>
          <span>{{ 'home.how_step2' | translate }}</span>
        </div>
        <mat-icon class="how__arrow">arrow_forward</mat-icon>
        <div class="how__step">
          <mat-icon>credit_card</mat-icon>
          <span>{{ 'home.how_step3' | translate }}</span>
        </div>
      </div>
    </section>
  `,
  styles: `
    .hero {
      background:
        radial-gradient(1200px 400px at 80% -10%, color-mix(in srgb, var(--mat-sys-primary) 18%, transparent), transparent),
        var(--mat-sys-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .hero__inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 88px 20px 64px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
    }

    .hero__badge {
      padding: 4px 14px;
      border-radius: 999px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.04em;
    }

    .hero__title {
      font-size: 44px;
      line-height: 1.12;
      letter-spacing: -0.03em;
      margin: 0;
      max-width: 760px;
    }

    .hero__subtitle {
      font-size: 18px;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      max-width: 560px;
    }

    .hero__actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .hero__stats {
      display: flex;
      gap: 48px;
      margin-top: 32px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .hero__stat dt {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .hero__stat dd {
      margin: 4px 0 0;
      font-size: 28px;
      font-weight: 700;
    }

    .section {
      max-width: 1200px;
      margin: 0 auto;
      padding: 64px 20px;
    }

    .section--tint {
      max-width: none;
      background: var(--mat-sys-surface-container);
    }

    .section__head {
      text-align: center;
      margin-bottom: 36px;

      h2 {
        font-size: 32px;
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
    }

    .section__cta {
      text-align: center;
      margin-top: 28px;
    }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 20px;
    }

    .service-card mat-card-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 16px 16px;
    }

    .service-card__price {
      font-weight: 700;
      font-size: 18px;
    }

    .team-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    .team-card {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }

    .team-card__avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
    }

    .hours-card {
      max-width: 560px;
      margin: 0 auto;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      overflow: hidden;
    }

    .hours-card__row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);

      &:last-child {
        border-bottom: none;
      }

      span:first-child {
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .how {
      background: var(--mat-sys-surface-container);
      padding: 64px 20px;
    }

    .how__steps {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .how__step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
      max-width: 180px;

      mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        color: var(--mat-sys-primary);
      }
    }

    .how__arrow {
      color: var(--mat-sys-outline);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  private readonly data = inject(PortalDataService);
  private readonly seo = inject(SeoService);

  protected readonly tenant = this.tenants.currentTenant;

  private readonly servicesList = signal<Service[]>([]);
  private readonly professionalsList = signal<Professional[]>([]);

  protected readonly services = this.servicesList.asReadonly();
  protected readonly professionals = this.professionalsList.asReadonly();

  protected readonly pageTitle = computed(() => {
    const name = this.tenant()?.name ?? 'ReservaYa';
    return `${name} · ReservaYa`;
  });

  ngOnInit(): void {
    const slug = tenantSlugFromSnapshot(this.route.snapshot);
    if (!slug) return;
    this.tenants.resolve(slug).subscribe((tenant) => {
      this.seo.setPageMeta({
        title: `${tenant.name} · Reserva tu cita en línea`,
        description: tenant.description,
        type: 'website',
      });
      this.data
        .services(tenant.tenantId)
        .subscribe((s) => this.servicesList.set(s));
      this.data
        .professionals(tenant.tenantId)
        .subscribe((p) => this.professionalsList.set(p));
    });
  }
}