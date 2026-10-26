import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { Service } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { ServiceDialog } from '../../components/service-dialog/service-dialog.component';

@Component({
  selector: 'app-owner-services',
  imports: [
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="services">
      <div class="services__head">
        <h1>{{ 'dashboard.manage_services' | translate }}</h1>
        <button mat-flat-button (click)="openCreate()">
          <mat-icon>add</mat-icon>
          {{ 'dashboard.add_service' | translate }}
        </button>
      </div>

      <mat-card class="services__panel">
        <table mat-table [dataSource]="rows()" class="services__table">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.service' | translate }}</th>
            <td mat-cell *matCellDef="let s">
              <strong>{{ s.name }}</strong>
              <span class="services__desc">{{ s.description }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="duration">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.duration' | translate }}</th>
            <td mat-cell *matCellDef="let s">{{ s.durationMinutes }} {{ 'common.minutes' | translate }}</td>
          </ng-container>
          <ng-container matColumnDef="price">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.price' | translate }}</th>
            <td mat-cell *matCellDef="let s">{{ s.price | appMoney }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.active' | translate }}</th>
            <td mat-cell *matCellDef="let s">
              <mat-slide-toggle [checked]="s.active" (change)="toggle(s)"></mat-slide-toggle>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
      </mat-card>
    </div>
  `,
  styles: `
    .services {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .services__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }
    }

    .services__panel {
      padding: 16px;
    }

    .services__table {
      width: 100%;
    }

    .services__desc {
      display: block;
      font-weight: 400;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerServicesPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly dialog = inject(MatDialog);
  private readonly items = signal<Service[]>([]);
  protected readonly cols = ['name', 'duration', 'price', 'status'];

  private currentTenantId = '';

  protected readonly rows = this.items.asReadonly();

  ngOnInit(): void {
    this.dashboard.ownerContext().subscribe((membership) => {
      if (!membership) return;
      this.currentTenantId = membership.tenantId;
      this.dashboard.ownerServices(membership.tenantId).subscribe((list) => this.items.set(list));
    });
  }

  protected openCreate(): void {
    if (!this.currentTenantId) return;
    const currency = this.items()[0]?.currency ?? 'COP';
    const tenantId = this.currentTenantId;
    this.dialog
      .open(ServiceDialog, { data: { tenantId, currency }, width: '520px' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.dashboard
          .ownerServices(tenantId)
          .subscribe((list) => this.items.set(list));
      });
  }

  protected toggle(service: Service): void {
    this.items.update((list) =>
      list.map((s) => (s.id === service.id ? { ...s, active: !s.active } : s)),
    );
  }
}