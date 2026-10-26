import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../../../core/seo/seo.service';
import {
  PlatformService,
  PlatformTenant,
  TENANT_CATEGORIES,
  TenantCategoryId,
} from '../../services/platform.service';

@Component({
  selector: 'app-landing-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
  ],
  template: `
    <section class="hero">
      <div class="hero__inner">
        <span class="hero__badge">{{ 'landing.badge' | translate }}</span>
        <h1 class="hero__title">{{ 'landing.hero_title' | translate }}</h1>
        <p class="hero__subtitle">{{ 'landing.hero_subtitle' | translate }}</p>
        <div class="hero__actions">
          <a mat-flat-button size="large" routerLink="/crear-negocio">
            <mat-icon>storefront</mat-icon>
            {{ 'landing.cta_own_business' | translate }}
          </a>
          <a mat-stroked-button size="large" routerLink="/" fragment="negocios">
            {{ 'landing.browse_services' | translate }}
          </a>
          <a mat-flat-button size="large" routerLink="/crear-cuenta" class="hero__register">
            <mat-icon>person_add</mat-icon>
            {{ 'landing.cta_register' | translate }}
          </a>
        </div>
        <dl class="hero__stats">
          <div class="hero__stat">
            <dt>{{ 'landing.stats_tenants' | translate }}</dt>
            <dd>{{ businesses() }}</dd>
          </div>
          <div class="hero__stat">
            <dt>{{ 'landing.stats_services' | translate }}</dt>
            <dd>{{ totalServices() }}</dd>
          </div>
          <div class="hero__stat">
            <dt>{{ 'landing.stats_professionals' | translate }}</dt>
            <dd>{{ totalProfessionals() }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <section id="como-funciona" class="section">
      <div class="section__head">
        <h2>{{ 'landing.how' | translate }}</h2>
        <p>{{ 'landing.how_subtitle' | translate }}</p>
      </div>
      <div class="steps">
        @for (step of steps; track step) {
          <div class="step">
            <mat-icon class="step__icon">{{ step.icon }}</mat-icon>
            <span class="step__index">{{ step.index }}</span>
            <h3>{{ step.title | translate }}</h3>
            <p>{{ step.text | translate }}</p>
          </div>
        }
      </div>
    </section>

    <section id="negocios" class="section section--alt">
      <div class="section__head">
        <h2>{{ 'landing.directory' | translate }}</h2>
        <p>{{ 'landing.directory_subtitle' | translate }}</p>
      </div>

      @if (loading()) {
        <div class="center-loader">
          <mat-spinner diameter="36" />
        </div>
      } @else {
        <div class="directory-controls">
          <mat-form-field appearance="outline" class="directory__search">
            <mat-label>{{ 'landing.search_placeholder' | translate }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput #query [value]="search()" (input)="search.set(query.value)" />
            @if (search()) {
              <button matSuffix mat-icon-button (click)="clearSearch(query)">
                <mat-icon>close</mat-icon>
              </button>
            }
          </mat-form-field>

          <div class="directory__chips">
            <button
              mat-stroked-button
              class="chip"
              [class.chip--on]="category() === null"
              (click)="category.set(null)"
            >
              {{ 'landing.category_all' | translate }}
            </button>
            @for (c of categories; track c.id) {
              <button
                mat-stroked-button
                class="chip"
                [class.chip--on]="category() === c.id"
                (click)="toggleCategory(c.id)"
              >
                <mat-icon>{{ c.icon }}</mat-icon>
                {{ c.labelKey | translate }}
              </button>
            }
          </div>

          <div class="directory__chips">
            <button
              mat-stroked-button
              class="chip"
              [class.chip--on]="city() === null"
              (click)="clearCity()"
            >
              <mat-icon>location_city</mat-icon>
              {{ 'landing.city_all' | translate }}
            </button>
            @for (c of cities(); track c) {
              <button
                mat-stroked-button
                class="chip"
                [class.chip--on]="city() === c"
                (click)="toggleCity(c)"
              >
                <mat-icon>place</mat-icon>
                {{ c }}
              </button>
            }
          </div>
        </div>

        <p class="directory__count">
          {{ filtered().length }} {{ 'landing.results_unit' | translate }}
        </p>

        <div class="biz-grid">
          @for (biz of filtered(); track biz.slug) {
            <mat-card class="biz">
              <div class="biz__avatar">{{ biz.name.charAt(0) }}</div>
              <h3 class="biz__name">{{ biz.name }}</h3>
              <p class="biz__tagline">{{ biz.tagline }}</p>
              <div class="biz__meta">
                <span class="biz__cat">
                  <mat-icon>{{ categoryIcon(biz.category) }}</mat-icon>
                  {{ categoryLabel(biz.category) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ biz.servicesCount }} {{ 'landing.services_unit' | translate }}
                </span>
                <span>
                  <mat-icon>people</mat-icon>
                  {{ biz.professionalsCount }} {{ 'landing.professionals_unit' | translate }}
                </span>
              </div>
              <a mat-stroked-button [routerLink]="['/', biz.slug]" class="biz__cta">
                {{ 'landing.view_business' | translate }}
              </a>
            </mat-card>
          } @empty {
            <p class="biz__empty">
              {{ (search() || category() !== null || city() !== null ? 'landing.no_search_results' : 'landing.empty') | translate }}
            </p>
          }
        </div>
      }
    </section>

    <section class="cta-band">
      <div class="cta-band__inner">
        <h2>{{ 'landing.cta_title' | translate }}</h2>
        <p>{{ 'landing.cta_subtitle' | translate }}</p>
        <a mat-flat-button size="large" routerLink="/crear-negocio">
          <mat-icon>add_business</mat-icon>
          {{ 'landing.cta_own_business' | translate }}
        </a>
      </div>
    </section>
  `,
  styles: `
    .hero {
      background:
        radial-gradient(1200px 420px at 80% -10%, var(--mat-sys-primary-container), transparent),
        linear-gradient(180deg, var(--mat-sys-surface-container-lowest), var(--mat-sys-surface));
    }
    .hero__inner {
      max-width: 1160px;
      margin: 0 auto;
      padding: 96px 20px 64px;
      text-align: center;
    }
    .hero__badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      color: var(--mat-sys-primary);
      background: var(--mat-sys-primary-container);
    }
    .hero__title {
      font-size: clamp(2.2rem, 5vw, 3.4rem);
      line-height: 1.08;
      letter-spacing: -0.03em;
      margin: 22px auto 16px;
      max-width: 760px;
    }
    .hero__subtitle {
      font-size: 1.15rem;
      color: var(--mat-sys-on-surface-variant);
      max-width: 560px;
      margin: 0 auto 28px;
    }
    .hero__actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .hero__stats {
      display: flex;
      justify-content: center;
      gap: 48px;
      margin: 52px 0 0;
    }
    .hero__stat dt {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }
    .hero__stat dd {
      font-size: 2rem;
      font-weight: 800;
      margin: 4px 0 0;
      letter-spacing: -0.02em;
    }

    .section {
      max-width: 1160px;
      margin: 0 auto;
      padding: 72px 20px;
    }
    .section--alt {
      border-block: 1px solid var(--mat-sys-outline-variant);
    }
    .section__head {
      text-align: center;
      margin-bottom: 40px;
    }
    .section__head h2 {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
      margin: 0 0 8px;
    }
    .section__head p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .step {
      position: relative;
      text-align: center;
      padding: 32px 20px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 20px;
      background: var(--mat-sys-surface-container-lowest);
    }
    .step__icon {
      width: 48px;
      height: 48px;
      font-size: 32px;
      color: var(--mat-sys-primary);
    }
    .step__index {
      position: absolute;
      top: 16px;
      right: 18px;
      font-size: 12px;
      font-weight: 700;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
      border-radius: 999px;
      padding: 2px 9px;
    }
    .step h3 {
      margin: 14px 0 6px;
    }
    .step p {
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
      margin: 0;
    }

    .center-loader {
      display: flex;
      justify-content: center;
      padding: 32px;
    }

    .directory-controls {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 20px;
    }
    .directory__search {
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
    }
    .directory__chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .chip {
      border-radius: 999px;
      line-height: 32px;
      font-size: 13px;
    }
    .chip mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .chip--on {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
    .directory__count {
      text-align: center;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 20px;
    }

    .biz-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }
    .biz {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .biz__avatar {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      font-size: 22px;
      font-weight: 700;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }
    .biz__name {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }
    .biz__tagline {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
      margin: 0;
      min-height: 36px;
      overflow-wrap: anywhere;
    }
    .biz__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 4px;
    }
    .biz__cat {
      flex: 1 1 100%;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .biz__meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .biz__meta mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
    }
    .biz__cta {
      margin-top: auto;
      width: 100%;
    }
    .biz__empty {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .cta-band {
      background: linear-gradient(180deg, var(--mat-sys-primary), var(--mat-sys-tertiary));
      color: var(--mat-sys-on-primary);
      margin-top: 40px;
    }
    .cta-band__inner {
      max-width: 1160px;
      margin: 0 auto;
      padding: 72px 20px;
      text-align: center;
    }
    .cta-band h2 {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
      margin: 0 0 8px;
    }
    .cta-band p {
      margin: 0 auto 24px;
      max-width: 480px;
      opacity: 0.92;
    }

    @media (max-width: 860px) {
      .steps {
        grid-template-columns: 1fr;
      }
      .hero__stats {
        gap: 24px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage implements OnInit {
  private readonly platform = inject(PlatformService);
  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(true);
  protected readonly directory = signal<PlatformTenant[]>([]);
  protected readonly search = signal('');
  protected readonly category = signal<TenantCategoryId | null>(null);
  protected readonly city = signal<string | null>(null);
  protected readonly langTick = signal(0);
  protected readonly categories = TENANT_CATEGORIES;
  protected readonly cities = computed(() =>
    [...new Set(this.directory().map((b) => b.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly steps = [
    { index: '1', icon: 'storefront', title: 'landing.step1', text: 'landing.step1_text' },
    { index: '2', icon: 'group_add', title: 'landing.step2', text: 'landing.step2_text' },
    { index: '3', icon: 'event_available', title: 'landing.step3', text: 'landing.step3_text' },
  ];

  constructor() {
    this.seo.setPageMeta({
      title: 'ReservaYa · Tu cita en minutos',
      description: 'Plataforma de reservas con pago integrado para negocios de servicios por turno.',
      type: 'website',
    });
  }

  protected readonly filtered = computed(() => {
    this.langTick();
    const q = this.normalize(this.search().trim());
    const cat = this.category();
    const city = this.city();
    return this.directory()
      .filter((b) => (cat ? b.category === cat : true))
      .filter((b) => (city ? b.city === city : true))
      .map((b) => ({ biz: b, score: this.matchScore(b, q) }))
      .filter((x) => x.score >= 0)
      .sort(
        (a, b) =>
          a.score - b.score ||
          b.biz.servicesCount +
            b.biz.professionalsCount -
            (a.biz.servicesCount + a.biz.professionalsCount),
      )
      .map((x) => x.biz);
  });

  ngOnInit(): void {
    this.platform.directory().subscribe({
      next: (list) => this.directory.set(list),
      error: () => this.directory.set([]),
      complete: () => this.loading.set(false),
    });
    this.translate.onLangChange.subscribe(() => this.langTick.update((v) => v + 1));
  }

  protected businesses(): number {
    return this.directory().length;
  }

  protected totalServices(): number {
    return this.directory().reduce((acc, b) => acc + b.servicesCount, 0);
  }

  protected totalProfessionals(): number {
    return this.directory().reduce((acc, b) => acc + b.professionalsCount, 0);
  }

  protected categoryLabel(id: TenantCategoryId): string {
    return this.translate.instant(`landing.category_${id}`);
  }

  protected categoryIcon(id: TenantCategoryId): string {
    return TENANT_CATEGORIES.find((c) => c.id === id)?.icon ?? 'storefront';
  }

  protected toggleCategory(id: TenantCategoryId): void {
    this.category.set(this.category() === id ? null : id);
  }

  protected toggleCity(city: string): void {
    this.city.set(this.city() === city ? null : city);
  }

  protected clearCity(): void {
    this.city.set(null);
  }

  protected clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.search.set('');
  }

  private matchScore(biz: PlatformTenant, q: string): number {
    if (!q) return 0;
    const name = this.normalize(biz.name);
    const tagline = this.normalize(biz.tagline);
    const label = this.normalize(this.categoryLabel(biz.category));
    if (name.includes(q)) return 0;
    if (tagline.includes(q)) return 1;
    if (label.includes(q)) return 2;
    return -1;
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}