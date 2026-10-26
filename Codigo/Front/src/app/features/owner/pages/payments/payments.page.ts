import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DashboardService,
  OwnerAppointmentRow,
} from '../../../dashboard/services/dashboard.service';
import { LedgerEntry, Tenant, Currency } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-owner-payments',
  imports: [MatCardModule, MatTableModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe, MoneyPipe],
  template: `
    <div class="pagos">
      <div class="pagos__head">
        <h1>{{ 'owner.pagos.title' | translate }}</h1>
        @if (tenant(); as t) {
          <p>{{ t.name }} · {{ 'owner.pagos.subtitle' | translate }}</p>
        }
      </div>

      @if (loading()) {
        <mat-card class="pagos__loading">
          <mat-spinner diameter="28" />
        </mat-card>
      } @else {
        <div class="pagos__grid">
          <mat-card class="metric">
            <mat-icon>account_balance_wallet</mat-icon>
            <span class="metric__label">{{ 'owner.pagos.collected' | translate }}</span>
            <strong class="metric__value">{{ collected() | appMoney }}</strong>
            <span class="metric__hint">{{ 'owner.pagos.collected_hint' | translate }}</span>
          </mat-card>

          <mat-card class="metric">
            <mat-icon>receipt_long</mat-icon>
            <span class="metric__label">{{ 'owner.pagos.pending_advance' | translate }}</span>
            <strong class="metric__value">{{ pendingAdvance() | appMoney }}</strong>
            <span class="metric__hint">{{ pendingCount() }} {{ 'owner.pagos.pending_advance_hint' | translate }}</span>
          </mat-card>

          <mat-card class="metric">
            <mat-icon>hourglass_empty</mat-icon>
            <span class="metric__label">{{ 'owner.pagos.outstanding' | translate }}</span>
            <strong class="metric__value">{{ outstanding() | appMoney }}</strong>
            <span class="metric__hint">{{ 'owner.pagos.outstanding_hint' | translate }}</span>
          </mat-card>

          <mat-card class="metric">
            <mat-icon>paid</mat-icon>
            <span class="metric__label">{{ 'dashboard.commission' | translate }}</span>
            <strong class="metric__value">{{ commission() | appMoney }}</strong>
            <span class="metric__hint">{{ 'owner.pagos.commission_hint' | translate }}</span>
          </mat-card>
        </div>

        <div class="pagos__columns">
          <mat-card class="panel">
            <div class="panel__head">
              <h2>{{ 'owner.pagos.advance_by_appointment' | translate }}</h2>
            </div>
            @if (rows().length === 0) {
              <p class="panel__empty">{{ 'owner.citas.empty' | translate }}</p>
            } @else {
              <table mat-table [dataSource]="rows()" class="panel__table">
                <ng-container matColumnDef="client">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.client' | translate }}</th>
                  <td mat-cell *matCellDef="let row">{{ row.appointment.clientInfo.name }}</td>
                </ng-container>
                <ng-container matColumnDef="when">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.when' | translate }}</th>
                  <td mat-cell *matCellDef="let row">{{ dateTime(row.appointment.startTime) }}</td>
                </ng-container>
                <ng-container matColumnDef="advance">
                  <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.paid_label' | translate }}</th>
                  <td mat-cell *matCellDef="let row" class="panel__paid">
                    {{ row.paidAmount | appMoney: row.currency }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="due">
                  <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.due_label' | translate }}</th>
                  <td mat-cell *matCellDef="let row" class="panel__due">
                    {{ dueText(row) }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="pay">
                  <th mat-header-cell *matHeaderCellDef>{{ 'owner.pagos.pay_state' | translate }}</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="pagos__pay pagos__pay--{{ row.appointment.paymentStatus }}">
                      {{ payLabel(row) }}
                    </span>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="pCols"></tr>
                <tr mat-row *matRowDef="let row; columns: pCols;"></tr>
              </table>
            }
          </mat-card>

          <mat-card class="panel">
            <div class="panel__head">
              <h2>{{ 'dashboard.ledger' | translate }}</h2>
            </div>
            @if (movements().length === 0) {
              <p class="panel__empty">{{ 'owner.pagos.no_movements' | translate }}</p>
            } @else {
              <table mat-table [dataSource]="movements()" class="panel__table">
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.date' | translate }}</th>
                  <td mat-cell *matCellDef="let m">{{ dateTime(m.timestamp) }}</td>
                </ng-container>
                <ng-container matColumnDef="ref">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.reference' | translate }}</th>
                  <td mat-cell *matCellDef="let m" class="panel__mono">{{ m.paymentReference ?? m.transactionId }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>{{ 'owner.pagos.type' | translate }}</th>
                  <td mat-cell *matCellDef="let m">{{ 'owner.pagos.type_' + m.type | translate }}</td>
                </ng-container>
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.amount' | translate }}</th>
                  <td
                    mat-cell
                    *matCellDef="let m"
                    [class.panel__credit]="m.direction === 'credit'"
                    [class.panel__debit]="m.direction === 'debit'"
                  >
                    {{ m.direction === 'debit' ? '−' : '+' }} {{ m.amount | appMoney: m.currency }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="mCols"></tr>
                <tr mat-row *matRowDef="let row; columns: mCols;"></tr>
              </table>
            }
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: `
    .pagos {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .pagos__head {
      margin-bottom: 24px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .pagos__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      mat-icon {
        color: var(--mat-sys-primary);
        margin-bottom: 8px;
      }
    }

    .metric__label {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .metric__value {
      font-size: 26px;
      letter-spacing: -0.02em;
    }

    .metric__hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;
    }

    .pagos__columns {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;

      @media (min-width: 960px) {
        grid-template-columns: 1fr 1fr;
      }
    }

    .panel {
      padding: 16px;
    }

    .panel__head {
      margin-bottom: 12px;

      h2 {
        margin: 0;
        font-size: 18px;
      }
    }

    .panel__table {
      width: 100%;
    }

    .panel__empty {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .panel__mono {
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }

    .panel__paid {
      color: var(--mat-sys-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .panel__due {
      color: var(--mat-sys-error);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .panel__credit {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }

    .panel__debit {
      color: var(--mat-sys-error);
      font-weight: 600;
    }

    .pagos__pay {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
      text-transform: uppercase;
      background: var(--mat-sys-surface-variant);
      color: var(--mat-sys-on-surface-variant);

      &--approved {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
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

    .pagos__loading {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerPaymentsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly translate = inject(TranslateService);
  private readonly moneyPipe = inject(MoneyPipe);

  protected readonly pCols = ['client', 'when', 'advance', 'due', 'pay'];
  protected readonly mCols = ['date', 'ref', 'type', 'amount'];

  private readonly tenantSignal = signal<Tenant | null>(null);
  private readonly rowsSignal = signal<OwnerAppointmentRow[]>([]);
  private readonly movementsSignal = signal<LedgerEntry[]>([]);
  private readonly revenueSignal = signal(0);
  private readonly commissionSignal = signal(0);
  private readonly loadingSignal = signal(true);

  protected readonly tenant = this.tenantSignal.asReadonly();
  protected readonly rows = this.rowsSignal.asReadonly();
  protected readonly movements = this.movementsSignal.asReadonly();
  protected readonly loading = this.loadingSignal.asReadonly();

  protected readonly collected = () => this.revenueSignal();
  protected readonly commission = () => this.commissionSignal();

  protected readonly pendingAdvance = () =>
    this.rows()
      .filter((r) => r.appointment.status === 'confirmed' && r.appointment.paymentStatus !== 'approved')
      .reduce((s, r) => s + r.advanceAmount, 0);

  protected readonly pendingCount = () =>
    this.rows().filter((r) => r.appointment.status === 'confirmed' && r.appointment.paymentStatus !== 'approved')
      .length;

  protected readonly outstanding = () =>
    this.rows()
      .filter((r) => r.appointment.status === 'confirmed')
      .reduce((s, r) => s + r.dueAmount, 0);

  ngOnInit(): void {
    this.dashboard.ownerContext().subscribe((membership) => {
      if (!membership) {
        this.loadingSignal.set(false);
        return;
      }
      const tenantId = membership.tenantId;
      this.dashboard.ownerOverview(tenantId).subscribe({
        next: (overview) => {
          this.tenantSignal.set(overview.tenant);
          this.revenueSignal.set(Math.round(overview.revenue * 100) / 100);
          this.commissionSignal.set(Math.round(overview.commission * 100) / 100);
          this.movementsSignal.set(overview.movements);
        },
        error: () => {
          this.movementsSignal.set([]);
        },
      });
      this.dashboard.ownerAppointments(tenantId).subscribe({
        next: (result) => {
          this.rowsSignal.set(result.rows);
          this.loadingSignal.set(false);
        },
        error: () => {
          this.rowsSignal.set([]);
          this.loadingSignal.set(false);
        },
      });
    });
  }

  protected dateTime(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected dueText(row: OwnerAppointmentRow): string {
    return row.dueAmount > 0 ? this.moneyPipe.transform(row.dueAmount, row.currency as Currency) : '—';
  }

  protected payLabel(row: OwnerAppointmentRow): string {
    if (
      row.appointment.paymentStatus === 'approved' &&
      row.paidAmount > 0 &&
      row.paidAmount >= row.appointment.serviceSnapshot.price
    ) {
      return this.translate.instant('history.pay_approved_full');
    }
    return this.translate.instant('history.pay_' + row.appointment.paymentStatus);
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}