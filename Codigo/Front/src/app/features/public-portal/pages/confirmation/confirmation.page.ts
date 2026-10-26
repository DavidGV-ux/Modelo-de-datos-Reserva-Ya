import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../services/booking.service';
import { TenantService, tenantSlugFromSnapshot } from '../../services/tenant.service';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-confirmation-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatCardModule, TranslatePipe, MoneyPipe],
  template: `
    <div class="confirmation">
      @if (appointment(); as appointment) {
        <mat-card class="confirmation__card">
          <mat-icon class="confirmation__icon" [class.confirmation__icon--muted]="appointment.paymentStatus !== 'approved'">
            {{ appointment.paymentStatus === 'approved' ? 'check_circle' : appointment.paymentStatus === 'pending' ? 'hourglass_top' : 'cancel' }}
          </mat-icon>
          @if (appointment.paymentStatus === 'approved') {
            <h1>{{ 'confirmation.title' | translate }}</h1>
            <p class="confirmation__subtitle">{{ 'confirmation.subtitle' | translate }}</p>
          } @else if (appointment.paymentStatus === 'pending') {
            <h1>{{ 'confirmation.title_pending' | translate }}</h1>
            <p class="confirmation__subtitle">{{ 'confirmation.subtitle_pending' | translate }}</p>
          } @else {
            <h1>{{ 'confirmation.title_declined' | translate }}</h1>
            <p class="confirmation__subtitle">{{ 'confirmation.subtitle_declined' | translate }}</p>
          }

          <div class="confirmation__data">
            <div class="confirmation__row">
              <span>{{ 'confirmation.service' | translate }}</span>
              <strong>{{ appointment.serviceSnapshot.name }}</strong>
            </div>
            <div class="confirmation__row">
              <span>{{ 'confirmation.address' | translate }}</span>
              <strong>{{ tenant()?.address ?? '—' }}</strong>
            </div>
            <div class="confirmation__row">
              <span>{{ 'confirmation.date' | translate }}</span>
              <strong>{{ dateLabel(appointment.startTime) }}</strong>
            </div>
            <div class="confirmation__row">
              <span>{{ 'confirmation.time' | translate }}</span>
              <strong>{{ timeLabel(appointment.startTime) }} – {{ timeLabel(appointment.endTime) }}</strong>
            </div>
            <div class="confirmation__row confirmation__row--total">
              <span>{{ 'confirmation.paid' | translate }}</span>
              <strong>{{ appointment.serviceSnapshot.price | appMoney: tenant()?.currency }}</strong>
            </div>
          </div>

          <div class="confirmation__note">
            <mat-icon>hourglass_top</mat-icon>
            <span>{{ noteKey(appointment) | translate }}</span>
          </div>

          <div class="confirmation__actions">
            <a mat-flat-button [routerLink]="['/', tenant()?.slug]">{{ 'common.back_home' | translate }}</a>
            <a mat-stroked-button [routerLink]="['/', tenant()?.slug, 'mi-historial']">
              {{ 'history.title' | translate }}
            </a>
          </div>
        </mat-card>
      } @else {
        <mat-card class="confirmation__card">
          <mat-icon class="confirmation__icon confirmation__icon--muted">event_busy</mat-icon>
          <h1>{{ 'confirmation.not_found' | translate }}</h1>
          <a mat-flat-button [routerLink]="['/', tenant()?.slug]">{{ 'common.back_home' | translate }}</a>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .confirmation {
      max-width: 560px;
      margin: 0 auto;
      padding: 60px 20px;
    }

    .confirmation__card {
      padding: 32px;
      text-align: center;
    }

    .confirmation__icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-primary);
    }

    .confirmation__icon--muted {
      color: var(--mat-sys-on-surface-variant);
    }

    h1 {
      margin: 12px 0 0;
    }

    .confirmation__subtitle {
      color: var(--mat-sys-on-surface-variant);
    }

    .confirmation__data {
      margin-top: 24px;
      text-align: left;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .confirmation__row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      font-size: 15px;
    }

    .confirmation__row span {
      color: var(--mat-sys-on-surface-variant);
    }

    .confirmation__row strong {
      text-align: right;
    }

    .confirmation__row--total strong {
      font-size: 20px;
    }

    .confirmation__note {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 20px;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
      text-align: left;
      font-size: 13px;
    }

    .confirmation__actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tenants = inject(TenantService);
  private readonly booking = inject(BookingService);
  private readonly translate = inject(TranslateService);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private pollAttempts = 0;
  protected readonly tenant = this.tenants.currentTenant;
  private readonly appointmentSignal = signal<Appointment | null>(null);
  protected readonly appointment = this.appointmentSignal.asReadonly();

  ngOnInit(): void {
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (!ref) return;
    const slug = tenantSlugFromSnapshot(this.route.snapshot);
    const resolved = this.tenants.currentTenant();
    if (resolved) {
      this.fetch(resolved.tenantId, ref);
      return;
    }
    if (!slug) return;
    this.tenants.resolve(slug).subscribe((tenant) => this.fetch(tenant.tenantId, ref));
  }

  private fetch(tenantId: string, ref: string): void {
    this.booking.getById(tenantId, ref).subscribe({
      next: (appointment) => {
        this.appointmentSignal.set(appointment);
        if (
          appointment.paymentStatus === 'pending' &&
          isPlatformBrowser(this.platformId) &&
          this.pollAttempts < 20
        ) {
          this.pollAttempts += 1;
          const timer = setTimeout(() => this.fetch(tenantId, ref), 3000);
          this.destroyRef.onDestroy(() => clearTimeout(timer));
        }
      },
      error: () => this.appointmentSignal.set(null),
    });
  }

  protected dateLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.currentLocale(), {
      dateStyle: 'full',
    }).format(new Date(iso));
  }

  protected noteKey(appointment: Appointment): string {
    if (appointment.paymentStatus === 'rejected') return 'confirmation.payment_failed';
    if (appointment.paymentStatus === 'pending') return 'confirmation.payment_note';
    return 'confirmation.paid_note';
  }

  protected timeLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.currentLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  private currentLocale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}