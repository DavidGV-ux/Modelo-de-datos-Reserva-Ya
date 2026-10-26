import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { interval } from 'rxjs';
import { BookingService } from '../../services/booking.service';
import { TenantService } from '../../services/tenant.service';
import { PaymentSessionService, PaymentSessionResult } from '../../services/payment-session.service';
import { WompiCheckoutService } from '../../services/wompi-checkout.service';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { BookingIntent } from '../../../../core/http/api-mappers';

@Component({
  selector: 'app-pay-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="pay">
      @if (error(); as message) {
        <mat-card class="pay__card">
          <mat-icon class="pay__icon pay__icon--muted">link_off</mat-icon>
          <h1>{{ 'pay.title' | translate }}</h1>
          <p class="pay__subtitle">{{ message | translate }}</p>
          <a mat-flat-button [href]="'/'">{{ 'common.back_home' | translate }}</a>
        </mat-card>
      } @else if (session()) {
        <mat-card class="pay__card">
          <mat-icon class="pay__icon">{{ 'pay.icon' | translate }}</mat-icon>
          <h1>{{ 'pay.title' | translate }}</h1>
          <p class="pay__subtitle">
            {{ tenant()?.name }} · {{ appointment()?.serviceSnapshot?.name }}
          </p>

          @if (appointment(); as appointment) {
            <div class="pay__data">
              <div class="pay__row">
                <span>{{ 'pay.date' | translate }}</span>
                <strong>{{ dateLabel(appointment.startTime) }}</strong>
              </div>
              <div class="pay__row">
                <span>{{ 'pay.time' | translate }}</span>
                <strong>{{ timeLabel(appointment.startTime) }}</strong>
              </div>
              <div class="pay__row pay__row--total">
                <span>{{ 'pay.amount' | translate }}</span>
                <strong>{{ session()?.amount | appMoney: session()?.currency }}</strong>
              </div>
            </div>
          }

          <div class="pay__modes">
            <button mat-stroked-button class="pay__mode" [class.pay__mode--active]="selectedMode() === 'advance'"
                    [disabled]="busy() || expired()" (click)="setMode('advance')">
              {{ 'pay.advance' | translate: { amount: (session()?.advanceAmount ?? 0) | appMoney: session()?.currency } }}
            </button>
            <button mat-stroked-button class="pay__mode" [class.pay__mode--active]="selectedMode() === 'full'"
                    [disabled]="busy() || expired()" (click)="setMode('full')">
              {{ 'pay.full' | translate: { amount: (session()?.fullAmount ?? 0) | appMoney: session()?.currency } }}
            </button>
          </div>

          <div class="pay__timer" [class.pay__timer--expired]="expired()">
            <mat-icon>{{ expired() ? 'timer_off' : 'schedule' }}</mat-icon>
            <span>{{ (expired() ? 'pay.expired' : 'pay.expires_in') | translate: { time: countdown() } }}</span>
          </div>

          @if (expired()) {
            <button mat-flat-button class="pay__refresh" (click)="refresh()">
              {{ 'pay.refresh' | translate }}
            </button>
          }

          <div class="pay__actions">
            <button mat-flat-button class="pay__pay" [disabled]="busy() || expired()" (click)="pay()">
              @if (busy()) {
                <mat-spinner diameter="20" />
              } @else {
                {{ 'pay.pay' | translate }}
              }
            </button>
          </div>
        </mat-card>
      } @else {
        <mat-card class="pay__card">
          <mat-progress-spinner mode="indeterminate" diameter="40" />
        </mat-card>
      }
    </div>
  `,
  styles: `
    .pay {
      max-width: 560px;
      margin: 0 auto;
      padding: 60px 20px;
    }

    .pay__card {
      padding: 32px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .pay__icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-primary);
    }

    .pay__icon--muted {
      color: var(--mat-sys-on-surface-variant);
    }

    h1 {
      margin: 12px 0 0;
    }

    .pay__subtitle {
      color: var(--mat-sys-on-surface-variant);
    }

    .pay__data {
      margin-top: 20px;
      width: 100%;
      text-align: left;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .pay__row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .pay__row--total strong {
      color: var(--mat-sys-primary);
      font-size: 20px;
    }

    .pay__modes {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      width: 100%;
      margin-top: 20px;
    }

    .pay__mode {
      text-align: center;
    }

    .pay__mode--active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
    }

    .pay__timer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 16px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .pay__timer--expired {
      color: var(--mat-sys-error);
    }

    .pay__refresh {
      margin-top: 8px;
    }

    .pay__actions {
      margin-top: 24px;
      width: 100%;
    }

    .pay__pay {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly tenants = inject(TenantService);
  private readonly booking = inject(BookingService);
  private readonly payments = inject(PaymentSessionService);
  private readonly checkout = inject(WompiCheckoutService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  protected readonly tenant = this.tenants.currentTenant;
  protected readonly session = signal<PaymentSessionResult | null>(null);
  protected readonly appointment = signal<Appointment | null>(null);
  protected readonly selectedMode = signal<'advance' | 'full'>('advance');
  protected readonly busy = signal(false);
  protected readonly expired = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly countdown = signal('');

  private tenantId = '';
  private appointmentId = '';
  private leftToResult = false;

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.appointmentId = this.route.snapshot.paramMap.get('appointmentId') ?? '';
    const session = this.route.snapshot.queryParamMap.get('session') ?? '';
    if (!this.tenantId || !this.appointmentId || !session) {
      this.error.set('pay.no_session');
      return;
    }
    this.tenants.resolve(this.tenantId).subscribe();
    this.booking.getById(this.tenantId, this.appointmentId).subscribe({
      next: (appointment) => this.appointment.set(appointment),
      error: () => this.error.set('pay.not_found'),
    });
    this.payments.resolve(this.tenantId, this.appointmentId, session).subscribe({
      next: (resolved) => this.applySession(resolved),
      error: () => this.error.set('pay.no_session'),
    });
  }

  private applySession(resolved: PaymentSessionResult): void {
    this.session.set(resolved);
    this.selectedMode.set(resolved.mode);
    this.error.set(null);
    this.expired.set(false);
    this.startCountdown(resolved.expiresAt);
  }

  private startCountdown(expiresAt: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const endMs = new Date(expiresAt).getTime();
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
        if (remaining <= 0) {
          this.expired.set(true);
          this.countdown.set('0:00');
          return;
        }
        const m = Math.floor(remaining / 60);
        const s = String(remaining % 60).padStart(2, '0');
        this.countdown.set(`${m}:${s}`);
      });
  }

  protected setMode(mode: 'advance' | 'full'): void {
    this.selectedMode.set(mode);
    if (this.session()?.mode === mode) return;
    if (this.busy()) return;
    this.busy.set(true);
    this.payments.create(this.tenantId, this.appointmentId, mode).subscribe({
      next: (resolved) => {
        this.applySession(resolved);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.snackbar.open('common.error', 'OK', { panelClass: 'app-error' });
      },
    });
  }

  protected refresh(): void {
    this.setMode(this.selectedMode());
  }

  protected pay(): void {
    if (this.busy() || this.expired()) return;
    const current = this.session();
    if (!current) return;
    this.busy.set(true);
    this.payWith(current.intent, current);
  }

  private payWith(intent: BookingIntent, current: PaymentSessionResult): void {
    if (intent.chargeMode === 'hosted' && intent.publicKey && intent.signatureIntegrity) {
      this.busy.set(false);
      this.checkout.open(intent).subscribe({
        next: (result) => this.onWidgetResult(result),
        error: () => {
          this.snackbar.open('common.error', 'OK', { panelClass: 'app-error' });
        },
      });
      return;
    }
    const appointment = this.appointment();
    if (!appointment) {
      this.busy.set(false);
      return;
    }
    this.booking
      .approvePayment(appointment, {
        reference: current.paymentReference,
        amount: current.amount,
        currency: current.currency,
      })
      .subscribe({
        next: () => this.goSuccess(),
        error: () => {
          this.busy.set(false);
          this.snackbar.open('common.error', 'OK', { panelClass: 'app-error' });
        },
      });
  }

  private onWidgetResult(result: { transaction?: { status?: string } }): void {
    const status = result.transaction?.status;
    if (status === 'APPROVED' && !this.leftToResult) {
      this.leftToResult = true;
      this.goSuccess();
    } else if (status) {
      this.snackbar.open('pay.failed', 'OK', { panelClass: 'app-error' });
    }
  }

  private goSuccess(): void {
    void this.router.navigate(['/', this.tenantId, 'confirmacion'], {
      queryParams: { ref: this.appointmentId },
    });
  }

  protected dateLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  }

  protected timeLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}