import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { TenantMembership } from '../../../../core/http/api-mappers';
import { Appointment, PaymentStatus } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-client-payments',
  imports: [MatCardModule, MatIconModule, MatButtonModule, RouterLink, TranslatePipe, MoneyPipe],
  template: `
    <div class="payments">
      <div class="payments__head">
        <h1>{{ 'dashboard.my_payments' | translate }}</h1>
        <p>{{ 'dashboard.my_payments_hint' | translate }}</p>
      </div>

      <div class="payments__list">
        @for (payment of all(); track payment.appointment.id) {
          <mat-card class="payment">
            <div class="payment__main">
              <h3>{{ payment.appointment.serviceSnapshot.name }}</h3>
              <div class="payment__meta">
                @if (businessName(payment.appointment.tenantId); as biz) {
                  <span>
                    <mat-icon>storefront</mat-icon>
                    {{ biz }}
                  </span>
                }
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ date(payment.appointment.startTime) }}
                </span>
                @if (payment.appointment.paymentReference) {
                  <span>
                    <mat-icon>receipt_long</mat-icon>
                    {{ payment.appointment.paymentReference }}
                  </span>
                }
              </div>
              <div class="payment__states">
                <span class="payment__status payment__status--{{ payment.status }}">
                  {{ ('history.pay_' + payment.status) | translate }}
                </span>
              </div>
            </div>
            <div class="payment__side">
              <strong>{{ payment.appointment.serviceSnapshot.price | appMoney: payment.appointment.serviceSnapshot.currency }}</strong>
            </div>
          </mat-card>
        } @empty {
          <mat-card class="payments__empty">
            <mat-icon>account_balance_wallet</mat-icon>
            <p>{{ 'dashboard.my_payments_empty' | translate }}</p>
            <a mat-stroked-button routerLink="/app/client">{{ 'dashboard.my_payments_empty_cta' | translate }}</a>
          </mat-card>
        }
      </div>

      <p class="payments__note">
        <mat-icon>info</mat-icon>
        {{ 'dashboard.my_payments_note' | translate }}
      </p>
    </div>
  `,
  styles: `
    .payments {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .payments__head {
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .payments__list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .payment {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px;
    }

    .payment__main h3 {
      margin: 0 0 8px;
    }

    .payment__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .payment__meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .payment__meta mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .payment__states {
      margin-top: 10px;
    }

    .payment__status {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      background: var(--mat-sys-surface-variant);
      color: var(--mat-sys-on-surface-variant);

      &--approved {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      &--pending {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }

      &--rejected,
      &--refunded,
      &--partially_refunded {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    }

    .payment__side strong {
      font-size: 18px;
    }

    .payments__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);

      > mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }

      a {
        margin-top: 12px;
      }
    }

    .payments__note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 20px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        margin-top: 1px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientPaymentsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly memberships = signal<TenantMembership[]>([]);
  private readonly translate = inject(TranslateService);

  private readonly payments = signal<{ appointment: Appointment; status: PaymentStatus }[]>([]);
  protected readonly all = this.payments.asReadonly();

  ngOnInit(): void {
    this.dashboard.myTenants().subscribe((list) => this.memberships.set(list));
    this.dashboard.allAppointments().subscribe({
      next: (list) => {
        this.payments.set(
          list
            .filter(
              (a) =>
                a.paymentStatus !== 'pending' || a.paymentReference,
            )
            .map((appointment) => ({ appointment, status: appointment.paymentStatus })),
        );
      },
      error: () => this.payments.set([]),
    });
  }

  protected businessName(tenantId: string): string | null {
    return this.memberships().find((m) => m.tenantId === tenantId)?.name ?? null;
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}