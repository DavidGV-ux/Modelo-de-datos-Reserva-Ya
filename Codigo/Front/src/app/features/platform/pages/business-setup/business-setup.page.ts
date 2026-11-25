import { ChangeDetectionStrategy, Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { PlatformService, TENANT_CATEGORIES, TenantCategoryId } from '../../services/platform.service';
import { compressLogoFile, isSupportedLogoFile, logoErrorKind } from '../../../../shared/utils/image-compression';

export const OWNER_TENANT_KEY = 'reserwaya.ownerTenant';

const COLOMBIAN_CITIES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Santa Marta',
  'Cúcuta',
  'Ibagué',
  'Pasto',
  'Villavicencio',
  'Armenia',
  'Neiva',
  'Popayán',
  'Montería',
  'Valledupar',
  'Sincelejo',
  'Tunja',
];

@Component({
  selector: 'app-business-setup-page',
  imports: [
    ReactiveFormsModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="setup">
      <div class="setup__head">
        <h1>{{ 'onboarding.title' | translate }}</h1>
        <p>{{ 'onboarding.subtitle' | translate }}</p>
      </div>

      @if (!auth.isAuthenticated()) {
        <div class="setup__auth">
          <mat-icon>lock_outline</mat-icon>
          <p>{{ 'onboarding.auth_required' | translate }}</p>
          <p class="setup__auth-note">{{ 'onboarding.auth_note' | translate }}</p>
          <button mat-flat-button (click)="login()">
            {{ 'common.login' | translate }}
          </button>
        </div>
      } @else {
        <mat-stepper linear #stepper="matStepper">
          <mat-step [stepControl]="form">
            <ng-template matStepLabel>{{ 'onboarding.step_business' | translate }}</ng-template>

            <form [formGroup]="form" class="setup__form">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_name' | translate }}</mat-label>
                <input matInput formControlName="name" (blur)="generateSlug()" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_category' | translate }}</mat-label>
                <mat-select formControlName="category">
                  @for (c of categories; track c.id) {
                    <mat-option [value]="c.id">{{ c.labelKey | translate }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_slug' | translate }}</mat-label>
                <input matInput formControlName="slug"
                  placeholder="mi-negocio" />
                <mat-hint>{{ 'onboarding.biz_slug_hint' | translate }}</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_tagline' | translate }}</mat-label>
                <input matInput formControlName="tagline" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_description' | translate }}</mat-label>
                <textarea matInput formControlName="description" rows="3"></textarea>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ 'onboarding.biz_city' | translate }}</mat-label>
                <mat-select formControlName="city">
                  @for (city of cities(); track city) {
                    <mat-option [value]="city">{{ city }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <div class="setup__logo">
                <label>{{ 'dashboard.branding_logo_title' | translate }}</label>
                @if (logoDataUrl(); as url) {
                  <img [src]="url" alt="logo" class="setup__logo-preview" />
                }
                <p class="setup__logo-hint">{{ 'dashboard.branding_logo_hint' | translate }}</p>
                <input type="file" accept="image/png,image/jpeg,image/webp" (change)="onLogoSelected($event)" [disabled]="uploadingLogo()" />
              </div>

              <div class="setup__row">
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'onboarding.biz_country' | translate }}</mat-label>
                  <input matInput formControlName="country" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'onboarding.biz_currency' | translate }}</mat-label>
                  <mat-select formControlName="currency">
                    <mat-option value="COP">COP</mat-option>
                    <mat-option value="USD">USD</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="setup__row">
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'onboarding.biz_phone' | translate }}</mat-label>
                  <input matInput formControlName="phone" placeholder="+57 300 000 0000" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="setup__grow">
                  <mat-label>{{ 'onboarding.biz_address' | translate }}</mat-label>
                  <input matInput formControlName="address" />
                </mat-form-field>
              </div>
            </form>

            <div class="setup__nav">
              <button mat-flat-button matStepperNext [disabled]="form.invalid">
                {{ 'common.next' | translate }}
              </button>
            </div>
          </mat-step>

          <mat-step>
            <ng-template matStepLabel>{{ 'onboarding.step_confirm' | translate }}</ng-template>

            <div class="setup__summary">
              @if (logoDataUrl(); as logoUrl) {
                <img [src]="logoUrl" alt="logo" class="setup__summary-logo" />
              }
              <h2>{{ form.value.name }}</h2>
              <p class="setup__summary-slug">reserwaya.com/{{ form.value.slug }}</p>
              <p>{{ form.value.tagline }}</p>
              <p class="setup__summary-meta">
                {{ form.value.country }} · {{ form.value.currency }}
                @if (form.value.phone) {
                  · {{ form.value.phone }}
                }
              </p>
              <p class="setup__summary-meta">
                {{ 'onboarding.plan_basico_note' | translate }}
              </p>
            </div>

            <div class="setup__nav setup__nav--space">
              <button mat-stroked-button matStepperPrevious>{{ 'common.back' | translate }}</button>
              <button
                mat-flat-button
                [disabled]="submitting()"
                (click)="submit()"
              >
                @if (submitting()) {
                  <mat-spinner diameter="20" />
                } @else {
                  {{ 'onboarding.create' | translate }}
                }
              </button>
            </div>
          </mat-step>
        </mat-stepper>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 48px 20px;
    }
    .setup {
      max-width: 680px;
      margin: 0 auto;
    }
    .setup__head {
      margin-bottom: 28px;
    }
    .setup__head h1 {
      font-size: 1.8rem;
      letter-spacing: -0.02em;
      margin: 0 0 6px;
    }
    .setup__head p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }
    .setup__auth {
      text-align: center;
      padding: 48px 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 20px;
      background: var(--mat-sys-surface-container-lowest);
    }
    .setup__auth mat-icon {
      font-size: 42px;
      width: 42px;
      height: 42px;
      color: var(--mat-sys-primary);
    }
    .setup__auth-note {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 20px;
    }
    .setup__form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 16px;
    }
    .setup__row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .setup__grow {
      grid-column: 1 / -1;
    }
    .setup__nav {
      display: flex;
      justify-content: flex-end;
      padding: 20px 0 8px;
    }
    .setup__nav--space {
      justify-content: space-between;
      align-items: center;
    }
    .setup__nav button[mat-flat-button][disabled] mat-spinner {
      color: inherit;
    }
    .setup__logo-hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;
      margin: 4px 0 0;
    }
    .setup__summary-logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      margin-bottom: 12px;
    }
    .setup__summary {
      margin: 20px 0;
      padding: 24px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }
    .setup__summary h2 {
      margin: 0 0 4px;
    }
    .setup__summary-slug {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .setup__summary-meta {
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }
    @media (max-width: 560px) {
      .setup__row {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessSetupPage {
  protected readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  protected readonly submitting = signal(false);
  protected readonly categories = TENANT_CATEGORIES;
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly logoDataUrl = signal<string | null>(null);
  protected readonly uploadingLogo = signal(false);

  protected readonly cities = signal<string[]>(COLOMBIAN_CITIES);
  protected readonly loadingCities = signal(false);

  private async loadCities(country: string | null): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadingCities.set(true);
    try {
      const { City } = await import('country-state-city');
      const list = City.getCitiesOfCountry(country ?? 'CO')?.map((c) => c.name) ?? [];
      this.cities.set(Array.from(new Set(list)).sort());
    } finally {
      this.loadingCities.set(false);
    }
  }

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    category: new FormControl<TenantCategoryId | null>(null),
    slug: new FormControl('', {
      validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    }),
    tagline: new FormControl(''),
    description: new FormControl(''),
    country: new FormControl('CO'),
    city: new FormControl(''),
    currency: new FormControl<'COP' | 'USD'>('COP'),
    phone: new FormControl(''),
    address: new FormControl(''),
  });

  protected login(): void {
    void this.auth.login().subscribe((ok) => {
      if (ok) void this.router.navigateByUrl('/crear-negocio');
    });
  }

  protected generateSlug(): void {
    const name = (this.form.value.name ?? '').trim().toLowerCase();
    if (name && !this.form.value.slug) {
      const slug = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      this.form.patchValue({ slug });
    }
  }

  protected async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!isSupportedLogoFile(file)) {
      this.snackbar.open(this.translate.instant('dashboard.branding_logo_error_type'), undefined, { duration: 3000 });
      return;
    }
    this.uploadingLogo.set(true);
    try {
      const dataUrl = await compressLogoFile(file);
      this.logoDataUrl.set(dataUrl);
    } catch (error) {
      this.snackbar.open(
        this.translate.instant(`dashboard.branding_logo_error_${logoErrorKind(error)}`),
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.uploadingLogo.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadCities(this.form.controls.country.value);
    this.form.controls.country.valueChanges.subscribe((country) => {
      void this.loadCities(country);
      this.form.patchValue({ city: '' });
    });
  }

  protected submit(): void {
    const v = this.form.value;
    if (!v.name || !v.slug) return;

    this.submitting.set(true);
    this.platform
      .onboardTenant({
        slug: v.slug,
        name: v.name,
        category: v.category ?? undefined,
        tagline: v.tagline || undefined,
        description: v.description || undefined,
        country: v.country || undefined,
        city: v.city || undefined,
        currency: v.currency ?? 'COP',
        phone: v.phone || undefined,
        address: v.address || undefined,
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.dashboard.invalidateTenants();
          localStorage.setItem(OWNER_TENANT_KEY, result.tenant.tenantId);
          const finish = () => {
            this.snackbar.open(result.confirmation.message, undefined, { duration: 4000 });
            const slug = result.tenant.slug;
            const goBusiness = window.confirm('¿Deseas ir a la página de tu negocio recién creado?');
            if (goBusiness) {
              void this.router.navigateByUrl(`/${slug}`);
            } else {
              void this.router.navigateByUrl('/app');
            }
          };
          const logo = this.logoDataUrl();
          if (logo) {
            this.dashboard.uploadOwnerLogo(result.tenant.tenantId, logo, (result.tenant as { version?: number }).version ?? 1).subscribe({
              next: () => finish(),
              error: (err) => {
                const detail = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
                this.snackbar.open(
                  `${this.translate.instant('onboarding.logo_upload_failed')}${detail ? ` ${detail}` : ''}`,
                  undefined,
                  { duration: 6000, panelClass: 'snackbar-error' },
                );
                finish();
              },
            });
          } else {
            finish();
          }
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.error?.message === 'string'
              ? err.error.error.message
              : typeof err?.error?.message === 'string'
                ? err.error.message
                : 'common.error';
          this.snackbar.open(detail, undefined, { duration: 5000, panelClass: 'snackbar-error' });
        },
      });
  }
}