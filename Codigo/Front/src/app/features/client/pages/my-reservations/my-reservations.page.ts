import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { TenantMembership } from '../../../../core/http/api-mappers';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

interface Reminder {
  key: string;
  today?: boolean;
  n?: number;
}

@Component({
  selector: 'app-client-my-reservations',
  imports: [MatCardModule, MatIconModule, TranslatePipe, MoneyPipe],
  template: `
    <div class="reservations">
      <div class="reservations__head">
        <h1>{{ 'dashboard.my_reservations' | translate }}</h1>
        <p>{{ 'dashboard.my_reservations_hint' | translate }}</p>
      </div>

      <div class="reservations__list">
        @for (appointment of all(); track appointment.id) {
          <mat-card
            class="reservation"
            [class.reservation--cancelled]="isTerminal(appointment)"
          >
            <div class="reservation__main">
              <h3>{{ appointment.serviceSnapshot.name }}</h3>
              <div class="reservation__meta">
                <span>
                  <mat-icon>storefront</mat-icon>
                  {{ businessName(appointment.tenantId) }}
                </span>
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ date(appointment.startTime) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ time(appointment.startTime) }} – {{ time(appointment.endTime) }}
                </span>
                @if (appointment.createdAt) {
                  <span>
                    <mat-icon>receipt_long</mat-icon>
                    {{ (appointment.paymentStatus === 'approved' ? 'history.paid_on' : 'history.reserved_on') | translate }}
                    {{ date(appointment.createdAt) }}
                  </span>
                }
              </div>

              <div class="reservation__states">
                <span
                  class="reservation__status"
                  [class.reservation__status--bad]="appointment.status === 'cancelled' || appointment.status === 'expired'"
                >
                  {{ 'history.status_' + appointment.status | translate }}
                </span>
                <span class="reservation__pay reservation__pay--{{ appointment.paymentStatus }}">
                  {{ 'history.pay_' + appointment.paymentStatus | translate }}
                </span>
              </div>

              @if (reminderFor(appointment); as reminder) {
                <div class="reservation__reminder" [class.reservation__reminder--today]="reminder.today">
                  <mat-icon>alarm</mat-icon>
                  @if (reminder.n !== undefined) {
                    <span>{{ reminder.key | translate: { n: reminder.n } }}</span>
                  } @else {
                    <span>{{ reminder.key | translate }}</span>
                  }
                </div>
              }

              @if (canExpire(appointment)) {
                <p class="reservation__note">
                  <mat-icon>info</mat-icon>
                  <span>{{ 'history.expire_note' | translate }}</span>
                </p>
              }
            </div>
            <div class="reservation__side">
              <strong>{{ appointment.serviceSnapshot.price | appMoney: appointment.serviceSnapshot.currency }}</strong>
            </div>
          </mat-card>
        } @empty {
          <mat-card class="reservations__empty">
            <mat-icon>event_available</mat-icon>
            <p>{{ 'history.empty' | translate }}</p>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: `
    .reservations {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .reservations__head {
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

    .reservations__list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .reservation {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 18px;
    }

    .reservation--cancelled {
      opacity: 0.6;
    }

    .reservation__main h3 {
      margin: 0 0 8px;
    }

    .reservation__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .reservation__meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .reservation__meta mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .reservation__states {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .reservation__status,
    .reservation__pay {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
    }

    .reservation__status {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);

      &--bad {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    }

    .reservation__pay {
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

      &--rejected {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    }

    .reservation__reminder {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font-size: 13px;
      font-weight: 600;

      &--today {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .reservation__note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 12px 0 0;
      color: var(--mat-sys-error);
      font-size: 12px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        margin-top: 1px;
      }
    }

    .reservation__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      font-size: 18px;
    }

    .reservations__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .reservations__empty mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientMyReservationsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly translate = inject(TranslateService);

  private readonly reservations = signal<Appointment[]>([]);
  private readonly memberships = signal<TenantMembership[]>([]);

  protected readonly all = this.reservations.asReadonly();

  ngOnInit(): void {
    this.dashboard.allAppointments().subscribe((list) => this.reservations.set(list));
    this.dashboard.myTenants().subscribe((list) => this.memberships.set(list));
  }

  protected businessName(tenantId: string): string {
    return this.memberships().find((m) => m.tenantId === tenantId)?.name ?? '—';
  }

  protected isTerminal(appointment: Appointment): boolean {
    return ['cancelled', 'expired', 'completed', 'no_show'].includes(appointment.status);
  }

  protected canExpire(appointment: Appointment): boolean {
    if (appointment.paymentStatus === 'approved') return false;
    return appointment.status === 'pending_payment' && !this.isPast(appointment);
  }

  protected reminderFor(appointment: Appointment): Reminder | null {
    if (this.isTerminal(appointment) || this.isPast(appointment)) return null;
    const ms = new Date(appointment.startTime).getTime() - Date.now();
    const days = Math.max(0, Math.round(ms / 86_400_000));
    if (days <= 0) return { key: 'history.reminder_today', today: true };
    if (days === 1) return { key: 'history.reminder_tomorrow' };
    return { key: 'history.reminder_days', n: days };
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private isPast(appointment: Appointment): boolean {
    return new Date(appointment.startTime).getTime() < Date.now();
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}