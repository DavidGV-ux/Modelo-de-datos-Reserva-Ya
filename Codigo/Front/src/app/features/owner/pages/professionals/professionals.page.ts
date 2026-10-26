import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { Professional, Service } from '../../../../shared/models/domain.model';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import {
  InviteProfessionalDialog,
  InviteProfessionalDialogData,
} from '../../components/invite-professional-dialog/invite-professional-dialog.component';
import { ProfessionalEditDialog } from '../../components/professional-edit-dialog/professional-edit-dialog.component';
import { ProfessionalScheduleDialog } from '../../components/professional-schedule-dialog/professional-schedule-dialog.component';

@Component({
  selector: 'app-owner-professionals',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="profs">
      <div class="profs__head">
        <h1>{{ 'owner.professionals_title' | translate }}</h1>
        <button mat-flat-button (click)="openInvite()">
          <mat-icon>add</mat-icon>
          {{ 'owner.invite_submit' | translate }}
        </button>
      </div>

      <div class="profs__grid">
        @for (professional of professionals(); track professional.id) {
          <mat-card class="prof">
            <div class="prof__avatar">{{ professional.name.charAt(0) }}</div>
            <h3>
              {{ professional.name }}
              @if (!professional.keycloakUserId) {
                <span class="prof__badge">{{ 'owner.prof_no_access' | translate }}</span>
              }
            </h3>
            <p class="prof__title">{{ professional.title }}</p>
            @if (!professional.keycloakUserId) {
              <p class="prof__hint">{{ 'owner.prof_no_access_hint' | translate }}</p>
            }

            <mat-chip-set class="prof__chips">
              @for (id of professional.serviceIds; track id) {
                <mat-chip>{{ serviceName(id) }}</mat-chip>
              }
            </mat-chip-set>

            <div class="prof__hours">
              <mat-icon>schedule</mat-icon>
              <span>{{ 'owner.invite_active' | translate }}</span>
            </div>

            <div class="prof__actions">
              <button mat-stroked-button (click)="openEdit(professional)">{{ 'owner.edit' | translate }}</button>
              <button mat-stroked-button (click)="openSchedule(professional)">{{ 'owner.schedule' | translate }}</button>
            </div>
          </mat-card>
        } @empty {
          <p class="profs__empty">{{ 'owner.invite_empty' | translate }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .profs {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .profs__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }
    }

    .profs__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .prof {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .prof__avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 22px;
      font-weight: 700;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }

    .prof h3 {
      margin: 4px 0 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .prof__badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
      vertical-align: middle;
    }

    .prof__hint {
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .prof__title {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .prof__chips {
      margin-top: 4px;
    }

    .prof__hours {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .prof__actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .profs__empty {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerProfessionalsPage implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly dashboard = inject(DashboardService);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly professionals = signal<Professional[]>([]);
  protected readonly serviceCatalog = signal<Service[]>([]);

  private currentTenantId = '';

  protected serviceName(id: string): string {
    return this.serviceCatalog().find((s) => s.id === id)?.name ?? id;
  }

  ngOnInit(): void {
    this.dashboard.ownerContext().subscribe((membership) => {
      if (!membership) return;
      this.currentTenantId = membership.tenantId;
      this.reload(membership.tenantId);
    });
  }

  protected openInvite(): void {
    if (!this.currentTenantId) return;
    const tenantId = this.currentTenantId;
    const data: InviteProfessionalDialogData = {
      tenantId,
      services: this.serviceCatalog(),
    };
    this.dialog
      .open(InviteProfessionalDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.reload(tenantId);
      });
  }

  protected openEdit(professional: Professional): void {
    if (!this.currentTenantId) return;
    const tenantId = this.currentTenantId;
    this.dialog
      .open(ProfessionalEditDialog, {
        data: { tenantId, professional },
        width: '480px',
      })
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) return;
        this.reload(tenantId);
      });
  }

  protected openSchedule(professional: Professional): void {
    if (!this.currentTenantId) return;
    const tenantId = this.currentTenantId;
    this.dialog
      .open(ProfessionalScheduleDialog, {
        data: { tenantId, professional },
        width: '560px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.reload(tenantId);
      });
  }

  private reload(tenantId: string): void {
    if (!tenantId) return;
    this.dashboard.ownerServices(tenantId).subscribe({
      next: (services) => this.serviceCatalog.set(services),
      error: () => this.serviceCatalog.set([]),
    });
    this.dashboard.ownerProfessionals(tenantId).subscribe({
      next: (list) => this.professionals.set(list),
      error: () => {
        this.professionals.set([]);
        this.snackbar.open('common.error', undefined, {
          duration: 4000,
          panelClass: 'snackbar-error',
        });
      },
    });
  }
}