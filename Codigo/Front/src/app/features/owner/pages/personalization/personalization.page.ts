import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { of } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { Tenant } from '../../../../shared/models/domain.model';
import { compressLogoFile } from '../../../../shared/utils/image-compression';
import { DEFAULT_BRAND_COLOR, contrastColor, normalizeBrandColor } from '../../../../shared/utils/color';

@Component({
  selector: 'app-owner-personalization',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
    RouterLink,
  ],
  template: `
    <div class="personalization">
      <div class="personalization__head">
        <div>
          <h1>{{ 'dashboard.branding_title' | translate }}</h1>
          <p>{{ 'dashboard.branding_subtitle' | translate }}</p>
        </div>
        @if (branding()?.slug; as slug) {
          <a mat-stroked-button [routerLink]="['/', slug]" target="_blank" rel="noopener">
            <mat-icon>open_in_new</mat-icon>
            {{ 'dashboard.branding_public_link' | translate }}
          </a>
        }
      </div>

      @if (loading()) {
        <div class="personalization__loader">
          <mat-spinner diameter="36" />
          <span>{{ 'common.loading' | translate }}</span>
        </div>
      } @else if (error()) {
        <mat-card class="personalization__state">
          <mat-icon>error_outline</mat-icon>
          <p>{{ 'dashboard.branding_load_error' | translate }}</p>
        </mat-card>
      } @else if (!branding()) {
        <mat-card class="personalization__state">
          <mat-icon>storefront</mat-icon>
          <p>{{ 'dashboard.branding_empty' | translate }}</p>
        </mat-card>
      } @else {
        <div class="personalization__grid">
          <mat-card class="personalization__card">
            <div class="personalization__card-head">
              <h2>{{ 'dashboard.branding_logo_title' | translate }}</h2>
              <p>{{ 'dashboard.branding_logo_hint' | translate }}</p>
            </div>

            <div class="logo-preview" [class.logo-preview--empty]="!branding()?.logoUrl">
              @if (branding()?.logoUrl; as logoUrl) {
                <img [src]="logoUrl" [alt]="branding()?.name" />
              } @else {
                <mat-icon>storefront</mat-icon>
              }
            </div>

            @if (uploading()) {
              <div class="personalization__processing">
                <mat-spinner diameter="18" />
                <span>{{ 'dashboard.branding_logo_processing' | translate }}</span>
              </div>
            }

            <div class="personalization__actions">
              <button mat-stroked-button type="button" [disabled]="uploading() || removing()" (click)="fileInput.click()">
                <mat-icon>upload</mat-icon>
                {{ 'dashboard.branding_logo_upload' | translate }}
              </button>
              @if (branding()?.logoUrl) {
                <button
                  mat-button
                  color="warn"
                  type="button"
                  [disabled]="uploading() || removing()"
                  (click)="removeLogo()"
                >
                  @if (removing()) {
                    <mat-spinner diameter="16" />
                  } @else {
                    <mat-icon>delete_outline</mat-icon>
                  }
                  {{ 'dashboard.branding_logo_remove' | translate }}
                </button>
              }
            </div>

            <input
              #fileInput
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              (change)="onFileSelected($event)"
            />
          </mat-card>

          <mat-card class="personalization__card">
            <div class="personalization__card-head">
              <h2>{{ 'dashboard.branding_color_title' | translate }}</h2>
              <p>{{ 'dashboard.branding_color_hint' | translate }}</p>
            </div>

            <div class="color-picker">
              <input
                type="color"
                [value]="selectedColor()"
                (input)="setColor($any($event.target).value)"
                aria-label="Color"
              />
              <input
                type="text"
                class="color-picker__hex"
                [value]="selectedColor()"
                maxlength="7"
                (input)="onHexInput($any($event.target).value)"
              />
            </div>

            <div class="color-presets">
              <span class="color-presets__label">{{ 'dashboard.branding_color_presets' | translate }}</span>
              <div class="color-presets__list">
                @for (color of presetColors; track color) {
                  <button
                    type="button"
                    class="color-presets__swatch"
                    [style.background]="color"
                    [attr.aria-label]="color"
                    (click)="setColor(color)"
                  ></button>
                }
              </div>
            </div>

            <div class="brand-preview" [style.--preview-brand]="selectedColor()">
              <div class="brand-preview__bar">
                <span class="brand-preview__mark" [style.background]="selectedColor()" [style.color]="previewOnColor()">
                  {{ branding()?.name?.charAt(0) }}
                </span>
                <strong>{{ branding()?.name }}</strong>
              </div>
              <div class="brand-preview__hero">
                <span class="brand-preview__badge">{{ 'dashboard.branding_preview' | translate }}</span>
                <h3>{{ 'dashboard.branding_preview_title' | translate }}</h3>
                <span class="brand-preview__cta" [style.background]="selectedColor()" [style.color]="previewOnColor()">
                  {{ 'dashboard.branding_preview_cta' | translate }}
                </span>
              </div>
            </div>

            <div class="personalization__actions">
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="savingColor() || !colorDirty()"
                (click)="saveColor()"
              >
                @if (savingColor()) {
                  <mat-spinner diameter="18" />
                } @else {
                  <mat-icon>save</mat-icon>
                }
                {{ 'dashboard.branding_color_save' | translate }}
              </button>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: `
    .personalization {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px 0;
    }

    .personalization__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;

      h1 {
        margin: 0 0 6px;
        letter-spacing: -0.02em;
      }

      p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .personalization__grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;

      @media (min-width: 920px) {
        grid-template-columns: 1fr 1fr;
      }
    }

    .personalization__card {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .personalization__card-head {
      h2 {
        margin: 0 0 4px;
        font-size: 20px;
      }

      p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
    }

    .personalization__loader,
    .personalization__state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 48px 20px;
      text-align: center;
    }

    .logo-preview {
      width: 100%;
      aspect-ratio: 1;
      max-width: 220px;
      border-radius: 20px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 16px;
        box-sizing: border-box;
      }

      mat-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .logo-preview--empty {
      background: repeating-linear-gradient(
        45deg,
        var(--mat-sys-surface-container),
        var(--mat-sys-surface-container) 10px,
        var(--mat-sys-surface-container-high) 10px,
        var(--mat-sys-surface-container-high) 20px
      );
    }

    .personalization__processing {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }

    .personalization__actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .color-picker {
      display: flex;
      gap: 12px;
      align-items: center;

      input[type='color'] {
        width: 56px;
        height: 44px;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 12px;
        background: transparent;
        cursor: pointer;
      }
    }

    .color-picker__hex {
      flex: 1;
      min-width: 0;
      height: 44px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 0 14px;
      font-family: monospace;
      font-size: 15px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
    }

    .color-presets {
      display: flex;
      flex-direction: column;
      gap: 8px;

      &__label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }

      &__list {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      &__swatch {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      }
    }

    .brand-preview {
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      overflow: hidden;
      background: var(--mat-sys-surface-container);

      &__bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }

      &__mark {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
      }

      &__hero {
        padding: 20px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: color-mix(in srgb, var(--preview-brand, var(--mat-sys-primary)) 16%, var(--mat-sys-surface));
      }

      &__badge {
        align-self: flex-start;
        padding: 2px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--preview-brand, var(--mat-sys-primary)) 18%, #fff);
        color: color-mix(in srgb, var(--preview-brand, var(--mat-sys-primary)) 70%, #000);
        font-size: 12px;
        font-weight: 600;
      }

      &__cta {
        align-self: flex-start;
        padding: 8px 14px;
        border-radius: 12px;
        font-weight: 600;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerPersonalizationPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly branding = signal<Tenant | null>(null);
  protected readonly selectedColor = signal(DEFAULT_BRAND_COLOR);
  protected readonly savingColor = signal(false);
  protected readonly uploading = signal(false);
  protected readonly removing = signal(false);

  protected readonly presetColors = [
    '#2e7d32',
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#ea580c',
    '#0f766e',
    '#111827',
    '#b45309',
  ];

  protected readonly colorDirty = signal(false);

  protected readonly previewOnColor = signal('#ffffff');

  ngOnInit(): void {
    this.dashboard
      .ownerContext()
      .pipe(
        switchMap((membership) => {
          if (!membership) {
            this.loading.set(false);
            return of(null);
          }
          return this.dashboard.ownerBranding(membership.tenantId);
        }),
      )
      .subscribe({
        next: (tenant) => {
          if (!tenant) {
            this.loading.set(false);
            return;
          }
          this.branding.set(tenant);
          const color = normalizeBrandColor(tenant.brandColor) ?? DEFAULT_BRAND_COLOR;
          this.selectedColor.set(color);
          this.previewOnColor.set(contrastColor(color));
          this.colorDirty.set(false);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });

    // Keep dirty state synced with selected color.
    // (handled in setColor)
  }

  protected setColor(value: string): void {
    const normalized = normalizeBrandColor(value);
    const color = normalized ?? this.selectedColor();
    this.selectedColor.set(color);
    this.previewOnColor.set(contrastColor(color));
    const current = normalizeBrandColor(this.branding()?.brandColor) ?? DEFAULT_BRAND_COLOR;
    this.colorDirty.set(color !== current);
  }

  protected onHexInput(value: string): void {
    if (value.length === 7) {
      this.setColor(value);
    } else {
      this.selectedColor.set(value);
    }
  }

  protected saveColor(): void {
    const tenant = this.branding();
    if (!tenant) return;
    const color = normalizeBrandColor(this.selectedColor());
    if (!color) {
      this.snackbar.open(this.translate.instant('dashboard.branding_color_invalid'), undefined, { duration: 3000 });
      return;
    }
    this.savingColor.set(true);
    this.dashboard.updateOwnerBranding(tenant.tenantId, color, tenant.version).subscribe({
      next: (updated) => {
        this.branding.set(updated);
        const nextColor = normalizeBrandColor(updated.brandColor) ?? DEFAULT_BRAND_COLOR;
        this.selectedColor.set(nextColor);
        this.previewOnColor.set(contrastColor(nextColor));
        this.colorDirty.set(false);
        this.savingColor.set(false);
        this.snackbar.open(this.translate.instant('dashboard.branding_color_saved'), undefined, { duration: 2500 });
      },
      error: () => {
        this.savingColor.set(false);
        this.snackbar.open(this.translate.instant('dashboard.branding_color_error'), undefined, { duration: 3000 });
      },
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      this.snackbar.open(this.translate.instant('dashboard.branding_logo_error_type'), undefined, { duration: 3000 });
      return;
    }
    this.uploading.set(true);
    compressLogoFile(file)
      .then((dataUrl) => {
        const tenant = this.branding();
        if (!tenant) throw new Error('no_tenant');
        return this.dashboard.uploadOwnerLogo(tenant.tenantId, dataUrl, tenant.version).toPromise();
      })
      .then((updated) => {
        if (!updated) return;
        this.branding.set(updated);
        this.uploading.set(false);
        this.snackbar.open(this.translate.instant('dashboard.branding_logo_saved'), undefined, { duration: 2500 });
      })
      .catch((error: unknown) => {
        this.uploading.set(false);
        const message =
          error instanceof Error && error.message === 'output_too_large'
            ? this.translate.instant('dashboard.branding_logo_error_size')
            : error instanceof Error && error.message === 'invalid_image'
              ? this.translate.instant('dashboard.branding_logo_error_type')
              : error instanceof Error && error.message === 'image_too_small'
                ? this.translate.instant('dashboard.branding_logo_error_small')
                : this.translate.instant('dashboard.branding_logo_error');
        this.snackbar.open(message, undefined, { duration: 3500 });
      });
  }

  protected removeLogo(): void {
    const tenant = this.branding();
    if (!tenant) return;
    this.removing.set(true);
    this.dashboard.removeOwnerLogo(tenant.tenantId, tenant.version).subscribe({
      next: (updated) => {
        this.branding.set(updated);
        this.removing.set(false);
        this.snackbar.open(this.translate.instant('dashboard.branding_logo_removed'), undefined, { duration: 2500 });
      },
      error: () => {
        this.removing.set(false);
        this.snackbar.open(this.translate.instant('dashboard.branding_logo_error'), undefined, { duration: 3000 });
      },
    });
  }
}
