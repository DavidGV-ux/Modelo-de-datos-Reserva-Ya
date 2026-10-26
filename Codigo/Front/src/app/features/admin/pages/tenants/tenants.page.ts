import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';

interface TenantRow {
  slug: string;
  name: string;
  country: string;
  plan: string;
  commission: number;
  status: 'active' | 'suspended';
}

@Component({
  selector: 'app-admin-tenants',
  imports: [MatCardModule, MatTableModule, MatIconModule, MatButtonModule, MatChipsModule, TranslatePipe],
  template: `
    <div class="tenants">
      <div class="tenants__head">
        <h1>{{ 'dashboard.admin_tenants' | translate }}</h1>
        <button mat-flat-button>
          <mat-icon>add</mat-icon>
          {{ 'dashboard.add_tenant' | translate }}
        </button>
      </div>

      <mat-card class="tenants__panel">
        <table mat-table [dataSource]="rows()" class="tenants__table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.tenant' | translate }}</th>
            <td mat-cell *matCellDef="let t">
              <strong>{{ t.name }}</strong>
              <span class="tenants__slug">/{{ t.slug }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="plan">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.plan' | translate }}</th>
            <td mat-cell *matCellDef="let t">{{ t.plan }}</td>
          </ng-container>
          <ng-container matColumnDef="commission">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.commission' | translate }}</th>
            <td mat-cell *matCellDef="let t">{{ t.commission }}%</td>
          </ng-container>
          <ng-container matColumnDef="country">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.country' | translate }}</th>
            <td mat-cell *matCellDef="let t">{{ t.country }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.status' | translate }}</th>
            <td mat-cell *matCellDef="let t">
              <mat-chip [class]="t.status === 'active' ? 'tenants__chip--active' : 'tenants__chip--suspended'" highlighted>
                {{ t.status }}
              </mat-chip>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
      </mat-card>
    </div>
  `,
  styles: `
    .tenants {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .tenants__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }
    }

    .tenants__panel {
      padding: 16px;
    }

    .tenants__table {
      width: 100%;
    }

    .tenants__slug {
      display: block;
      font-weight: 400;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .tenants__chip--active {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .tenants__chip--suspended {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTenantsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  protected readonly cols = ['name', 'plan', 'commission', 'country', 'status'];
  private readonly rowsSignal = signal<TenantRow[]>([]);
  protected readonly rows = this.rowsSignal.asReadonly();

  ngOnInit(): void {
    this.dashboard.adminTenants().subscribe((rows) => this.rowsSignal.set(rows));
  }
}