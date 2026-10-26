import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService, OwnerAppointmentRow } from '../../../dashboard/services/dashboard.service';
import { Professional, Tenant, Currency } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

type Action = 'completed' | 'no_show' | 'cancel';
type StatusValue = 'confirmed' | 'pending_payment' | 'completed' | 'no_show' | 'cancelled' | 'expired';

const TERMINAL = new Set<StatusValue>(['cancelled', 'expired', 'completed', 'no_show']);
const STATUSES: readonly StatusValue[] = [
  'confirmed',
  'pending_payment',
  'completed',
  'no_show',
  'cancelled',
  'expired',
];

@Component({
  selector: 'app-owner-appointments',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="citas">
      <div class="citas__head">
        <h1>{{ 'owner.citas.title' | translate }}</h1>
        @if (tenant(); as t) {
          <p>{{ t.name }} · {{ 'owner.citas.subtitle' | translate }}</p>
        }
      </div>

      @if (loading()) {
        <mat-card class="citas__loading">
          <mat-spinner diameter="28" />
        </mat-card>
      } @else if (rows().length === 0) {
        <mat-card class="citas__empty">
          <mat-icon>event_available</mat-icon>
          <p>{{ 'owner.citas.empty' | translate }}</p>
        </mat-card>
      } @else {
        <mat-card class="citas__card">
          <div class="citas__filters">
            <mat-form-field appearance="outline" class="citas__search">
              <mat-label>{{ 'owner.citas.search_placeholder' | translate }}</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput #query (input)="search.set(query.value)" />
              @if (search()) {
                <button matSuffix mat-icon-button (click)="clearSearch(query)">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="citas__select">
              <mat-label>{{ 'owner.citas.state_filter' | translate }}</mat-label>
              <mat-select [value]="statusFilter()" (selectionChange)="statusFilter.set($event.value)">
                <mat-option value="ALL">{{ 'owner.citas.filter_all_status' | translate }}</mat-option>
                @for (s of STATUSES; track s) {
                  <mat-option [value]="s">{{ 'history.status_' + s | translate }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (professionals().length > 1) {
              <mat-form-field appearance="outline" class="citas__select">
                <mat-label>{{ 'owner.citas.professional_filter' | translate }}</mat-label>
                <mat-select
                  [value]="professionalFilter()"
                  (selectionChange)="professionalFilter.set($event.value)"
                >
                  <mat-option value="">{{ 'owner.citas.filter_all_professional' | translate }}</mat-option>
                  @for (p of professionals(); track p.id) {
                    <mat-option [value]="p.id">{{ p.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>

          <div class="citas__summary">
            <span>
              <mat-icon>upcoming</mat-icon>
              <b>{{ confirmed().length }}</b> {{ 'owner.citas.confirmed' | translate }}
            </span>
            <span>
              <mat-icon>paid</mat-icon>
              <b>{{ totalPaid() | appMoney }}</b> {{ 'owner.citas.paid' | translate }}
            </span>
            <span>
              <mat-icon>hourglass_empty</mat-icon>
              <b>{{ totalDue() | appMoney }}</b> {{ 'owner.citas.due' | translate }}
            </span>
            @if (filteredCount() < rows().length) {
              <span class="citas__filtered">
                <mat-icon>filter_alt</mat-icon>
                {{ filteredCount() }} / {{ rows().length }}
              </span>
            }
          </div>

          <table mat-table [dataSource]="visible()" class="citas__table">
            <ng-container matColumnDef="client">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.client' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.appointment.clientInfo.name }}</td>
            </ng-container>
            <ng-container matColumnDef="professional">
              <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.professional_col' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ professionalName(row.appointment.professionalId) }}</td>
            </ng-container>
            <ng-container matColumnDef="service">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.service' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.appointment.serviceSnapshot.name }}</td>
            </ng-container>
            <ng-container matColumnDef="when">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.when' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ dateTime(row.appointment.startTime) }}</td>
            </ng-container>
            <ng-container matColumnDef="value">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.amount' | translate }}</th>
              <td mat-cell *matCellDef="let row">
                {{ row.appointment.serviceSnapshot.price | appMoney: row.currency }}
              </td>
            </ng-container>
            <ng-container matColumnDef="advance">
              <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.paid_label' | translate }}</th>
              <td mat-cell *matCellDef="let row" class="citas__paid-col">
                {{ row.paidAmount | appMoney: row.currency }}
                <span class="citas__pay-state citas__pay-state--{{
                  row.appointment.paymentStatus
                }}">
                  {{ payLabel(row) }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="due">
              <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.due_label' | translate }}</th>
              <td mat-cell *matCellDef="let row" class="citas__due-col">
                {{ dueText(row) }}
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'owner.citas.appointment_state' | translate }}</th>
              <td mat-cell *matCellDef="let row">
                <span
                  class="citas__state"
                  [class.citas__state--done]="row.appointment.status === 'completed'"
                  [class.citas__state--bad]="
                    row.appointment.status === 'cancelled' ||
                    row.appointment.status === 'no_show' ||
                    row.appointment.status === 'expired'
                  "
                >
                  {{ 'history.status_' + row.appointment.status | translate }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let row">
                @if (!TERMINAL.has(row.appointment.status)) {
                  <button
                    mat-flat-button
                    color="primary"
                    class="citas__action"
                    [disabled]="busyId() === row.appointment.id"
                    (click)="setStatus(row, 'completed')"
                  >
                    {{ 'owner.citas.complete' | translate }}
                  </button>
                  <button
                    mat-stroked-button
                    class="citas__action"
                    [disabled]="busyId() === row.appointment.id"
                    (click)="setStatus(row, 'no_show')"
                  >
                    {{ 'owner.citas.no_show' | translate }}
                  </button>
                  <button
                    mat-stroked-button
                    class="citas__action citas__action--warn"
                    [disabled]="busyId() === row.appointment.id"
                    (click)="setStatus(row, 'cancel')"
                  >
                    {{ 'owner.citas.cancel' | translate }}
                  </button>
                } @else {
                  <span class="citas__noop">—</span>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .citas {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .citas__head {
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

    .citas__card {
      padding: 16px;
    }

    .citas__filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 4px 4px 8px;
    }

    .citas__search {
      flex: 1 1 240px;
    }

    .citas__select {
      flex: 0 1 200px;
    }

    .citas__summary {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      padding: 4px 4px 16px;
      align-items: center;

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .citas__filtered {
      margin-left: auto;
    }

    .citas__table {
      width: 100%;
    }

    .citas__paid-col,
    .citas__due-col {
      font-variant-numeric: tabular-nums;
    }

    .citas__due-col {
      color: var(--mat-sys-error);
      font-weight: 600;
    }

    .citas__pay-state {
      display: inline-flex;
      margin-left: 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);

      &--approved {
        color: var(--mat-sys-primary);
      }

      &--pending {
        color: var(--mat-sys-tertiary);
      }

      &--rejected {
        color: var(--mat-sys-error);
      }
    }

    .citas__state {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      text-transform: uppercase;

      &--done {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      &--bad {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    }

    .citas__action {
      margin: 0 4px 4px 0;
      font-size: 12px;
      line-height: 28px;
      padding: 0 12px;

      &--warn {
        color: var(--mat-sys-error);
      }
    }

    .citas__noop {
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.5;
    }

    .citas__loading,
    .citas__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .citas__empty mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerAppointmentsPage implements OnInit {
  protected readonly TERMINAL = TERMINAL;
  protected readonly STATUSES = STATUSES;

  private readonly dashboard = inject(DashboardService);
  private readonly translate = inject(TranslateService);
  private readonly moneyPipe = inject(MoneyPipe);

  protected readonly cols = ['client', 'professional', 'service', 'when', 'value', 'advance', 'due', 'status', 'actions'];

  private readonly tenantSignal = signal<Tenant | null>(null);
  private readonly rowsSignal = signal<OwnerAppointmentRow[]>([]);
  private readonly loadingSignal = signal(true);
  private readonly busySignal = signal<string | null>(null);
  private readonly professionalsSignal = signal<Professional[]>([]);

  protected readonly search = signal('');
  protected readonly statusFilter = signal<'ALL' | StatusValue>('ALL');
  protected readonly professionalFilter = signal('');

  protected readonly tenant = this.tenantSignal.asReadonly();
  protected readonly rows = this.rowsSignal.asReadonly();
  protected readonly loading = this.loadingSignal.asReadonly();
  protected readonly busyId = this.busySignal.asReadonly();
  protected readonly professionals = this.professionalsSignal.asReadonly();

  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const st = this.statusFilter();
    const pf = this.professionalFilter();
    const raw = this.rows();
    const filtered = raw.filter((r) => {
      if (st !== 'ALL' && r.appointment.status !== st) return false;
      if (pf && r.appointment.professionalId !== pf) return false;
      if (q && !(r.appointment.clientInfo?.name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    const now = Date.now();
    const upcoming = filtered
      .filter((r) => new Date(r.appointment.startTime).getTime() >= now)
      .sort((a, b) => a.appointment.startTime.localeCompare(b.appointment.startTime));
    const past = filtered
      .filter((r) => new Date(r.appointment.startTime).getTime() < now)
      .sort((a, b) => b.appointment.startTime.localeCompare(a.appointment.startTime));
    return [...upcoming, ...past];
  });

  protected readonly filteredCount = computed(() => this.visible().length);
  protected readonly confirmed = computed(() =>
    this.visible().filter((r) => r.appointment.status === 'confirmed'),
  );
  protected readonly totalPaid = computed(() => this.visible().reduce((s, r) => s + r.paidAmount, 0));
  protected readonly totalDue = computed(() => this.visible().reduce((s, r) => s + r.dueAmount, 0));

  ngOnInit(): void {
    this.dashboard.ownerContext().subscribe((membership) => {
      if (!membership) {
        this.loadingSignal.set(false);
        return;
      }
      this.load(membership.tenantId);
    });
  }

  private load(tenantId: string): void {
    this.dashboard.ownerAppointments(tenantId).subscribe({
      next: (result) => {
        this.tenantSignal.set(result.tenant);
        this.rowsSignal.set(result.rows);
        this.loadingSignal.set(false);
      },
      error: () => {
        this.rowsSignal.set([]);
        this.loadingSignal.set(false);
      },
    });
    this.dashboard.ownerProfessionals(tenantId).subscribe({
      next: (list) => this.professionalsSignal.set(list),
      error: () => this.professionalsSignal.set([]),
    });
  }

  protected professionalName(professionalId: string): string {
    const name = this.professionalsSignal().find((p) => p.id === professionalId)?.name;
    return name ?? '—';
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

  protected clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.search.set('');
  }

  protected setStatus(row: OwnerAppointmentRow, action: Action): void {
    const appt = row.appointment;
    this.busySignal.set(appt.id);
    const tenantId = appt.tenantId;
    const done = (status: string, version?: number) => {
      this.rowsSignal.update((rows) =>
        rows.map((r) =>
          r.appointment.id === appt.id
            ? {
                ...r,
                appointment: {
                  ...r.appointment,
                  status: status as StatusValue,
                  version: version ?? r.appointment.version,
                },
              }
            : r,
        ),
      );
      this.busySignal.set(null);
    };

    if (action === 'cancel') {
      this.dashboard.cancelOwnerAppointment(tenantId, appt.id).subscribe({
        next: (updated) => done('cancelled', updated.version),
        error: () => this.busySignal.set(null),
      });
      return;
    }
    this.dashboard.ownerSetAppointmentStatus(tenantId, appt.id, action, appt.version).subscribe({
      next: (updated) => done(updated.appointment.status, updated.appointment.version),
      error: () => this.busySignal.set(null),
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

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}