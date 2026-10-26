import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { Appointment, LedgerEntry, Tenant } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-owner-overview',
  imports: [MatCardModule, MatTableModule, MatIconModule, MatButtonModule, TranslatePipe, MoneyPipe],
  template: `
    <div class="overview">
      <div class="overview__head">
        <h1>{{ 'dashboard.owner_title' | translate }}</h1>
        @if (tenant(); as t) {
          <p>{{ t.name }} · {{ planLabel(t.planId) }}</p>
        }
      </div>

      <div class="overview__grid">
        <mat-card class="metric">
          <mat-icon>account_balance_wallet</mat-icon>
          <span class="metric__label">{{ 'dashboard.revenue' | translate }}</span>
          <strong class="metric__value">{{ revenue() | appMoney }}</strong>
          <span class="metric__hint">{{ 'dashboard.revenue_hint' | translate }}</span>
        </mat-card>

        <mat-card class="metric">
          <mat-icon>event_available</mat-icon>
          <span class="metric__label">{{ 'dashboard.total_appointments' | translate }}</span>
          <strong class="metric__value">{{ totalAppointments() }}</strong>
          <span class="metric__hint">{{ confirmedToday() }} {{ 'dashboard.today' | translate }}</span>
        </mat-card>

        <mat-card class="metric">
          <mat-icon>schedule</mat-icon>
          <span class="metric__label">{{ 'dashboard.occupancy' | translate }}</span>
          <strong class="metric__value">{{ occupancy() }}%</strong>
          <span class="metric__hint">{{ 'dashboard.occupancy_hint' | translate }}</span>
        </mat-card>

        <mat-card class="metric">
          <mat-icon>paid</mat-icon>
          <span class="metric__label">{{ 'dashboard.commission' | translate }}</span>
          <strong class="metric__value">{{ commission() | appMoney }}</strong>
          <span class="metric__hint">5% · {{ 'dashboard.basic_plan' | translate }}</span>
        </mat-card>
      </div>

      <div class="overview__columns">
        <mat-card class="panel">
          <div class="panel__head">
            <h2>{{ 'dashboard.upcoming' | translate }}</h2>
            <a mat-stroked-button routerLink="/app/owner/services">{{ 'dashboard.manage_services' | translate }}</a>
          </div>
          <table mat-table [dataSource]="upcoming()" class="panel__table">
            <ng-container matColumnDef="client">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.client' | translate }}</th>
              <td mat-cell *matCellDef="let a">{{ a.clientInfo.name }}</td>
            </ng-container>
            <ng-container matColumnDef="service">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.service' | translate }}</th>
              <td mat-cell *matCellDef="let a">{{ a.serviceSnapshot.name }}</td>
            </ng-container>
            <ng-container matColumnDef="when">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.when' | translate }}</th>
              <td mat-cell *matCellDef="let a">{{ compactDate(a.startTime) }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.amount' | translate }}</th>
              <td mat-cell *matCellDef="let a">{{ a.serviceSnapshot.price | appMoney }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols;"></tr>
          </table>
        </mat-card>

        <mat-card class="panel">
          <div class="panel__head">
            <h2>{{ 'dashboard.ledger' | translate }}</h2>
          </div>
          <table mat-table [dataSource]="movements()" class="panel__table">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.date' | translate }}</th>
              <td mat-cell *matCellDef="let m">{{ compactDate(m.timestamp) }}</td>
            </ng-container>
            <ng-container matColumnDef="ref">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.reference' | translate }}</th>
              <td mat-cell *matCellDef="let m" class="panel__mono">{{ m.transactionId }}</td>
            </ng-container>
            <ng-container matColumnDef="credit">
              <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.credit' | translate }}</th>
              <td mat-cell *matCellDef="let m" class="panel__credit">+ {{ m.amount | appMoney }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="mCols"></tr>
            <tr mat-row *matRowDef="let row; columns: mCols;"></tr>
          </table>
        </mat-card>
      </div>

      <p class="overview__note">
        {{ 'dashboard.demo_user' | translate }}: {{ owner()?.keycloakUserId }} · {{ 'dashboard.session' | translate }}
      </p>
    </div>
  `,
  styles: `
    .overview {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .overview__head {
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

    .overview__grid {
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
      font-size: 28px;
      letter-spacing: -0.02em;
    }

    .metric__hint {
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;
    }

    .overview__columns {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;

      @media (min-width: 960px) {
        grid-template-columns: 3fr 2fr;
      }
    }

    .panel {
      padding: 16px;
    }

    .panel__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h2 {
        margin: 0;
        font-size: 18px;
      }
    }

    .panel__table {
      width: 100%;
    }

    .panel__mono {
      font-variant-numeric: tabular-nums;
    }

    .panel__credit {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }

    .overview__note {
      margin-top: 16px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerOverviewPage implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly dashboard = inject(DashboardService);

  protected readonly cols = ['client', 'service', 'when', 'amount'];
  protected readonly mCols = ['date', 'ref', 'credit'];

  private readonly tenantSignal = signal<Tenant | null>(null);
  private readonly revenueSignal = signal(0);
  private readonly totalSignal = signal(0);
  private readonly confirmedTodaySignal = signal(0);
  private readonly occupancySignal = signal(0);
  private readonly commissionSignal = signal(0);
  private readonly upcomingSignal = signal<Appointment[]>([]);
  private readonly movementsSignal = signal<LedgerEntry[]>([]);
  private readonly ownerSignal = signal<{ keycloakUserId: string; role: string } | null>(null);

  protected readonly tenant = this.tenantSignal.asReadonly();
  protected readonly revenue = this.revenueSignal.asReadonly();
  protected readonly totalAppointments = this.totalSignal.asReadonly();
  protected readonly confirmedToday = this.confirmedTodaySignal.asReadonly();
  protected readonly occupancy = this.occupancySignal.asReadonly();
  protected readonly commission = this.commissionSignal.asReadonly();
  protected readonly upcoming = this.upcomingSignal.asReadonly();
  protected readonly movements = this.movementsSignal.asReadonly();
  protected readonly owner = this.ownerSignal.asReadonly();

  ngOnInit(): void {
    this.dashboard.ownerContext().subscribe((membership) => {
      if (!membership) return;
      this.dashboard.ownerOverview(membership.tenantId).subscribe({
        next: (overview) => {
          this.tenantSignal.set(overview.tenant);
          this.revenueSignal.set(Math.round(overview.revenue * 100) / 100);
          this.totalSignal.set(overview.totalAppointments);
          this.confirmedTodaySignal.set(overview.confirmedToday);
          this.occupancySignal.set(overview.occupancy);
          this.commissionSignal.set(Math.round(overview.commission * 100) / 100);
          this.upcomingSignal.set(overview.upcoming);
          this.movementsSignal.set(overview.movements);
          this.ownerSignal.set(overview.owner);
        },
        error: () => {
          this.upcomingSignal.set([]);
          this.movementsSignal.set([]);
        },
      });
    });
  }

  protected compactDate(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected planLabel(planId: string): string {
    return planId === 'plan_pro' ? 'Pro' : 'Básico';
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}