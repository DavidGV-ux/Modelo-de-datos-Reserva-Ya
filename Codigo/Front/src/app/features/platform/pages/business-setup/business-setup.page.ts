import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { PlatformService, TENANT_CATEGORIES, TenantCategoryId } from '../../services/platform.service';

export const OWNER_TENANT_KEY = 'reserwaya.ownerTenant';

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

  protected readonly submitting = signal(false);
  protected readonly categories = TENANT_CATEGORIES;

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
        currency: v.currency ?? 'COP',
        phone: v.phone || undefined,
        address: v.address || undefined,
      })
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.dashboard.invalidateTenants();
          localStorage.setItem(OWNER_TENANT_KEY, result.tenant.tenantId);
          this.snackbar.open(result.confirmation.message, undefined, { duration: 4000 });
          void this.router.navigateByUrl(result.confirmation.nextStep ?? '/app/owner');
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.message === 'string' ? err.error.message : 'common.error';
          this.snackbar.open(detail, undefined, { duration: 5000, panelClass: 'snackbar-error' });
        },
      });
  }
}