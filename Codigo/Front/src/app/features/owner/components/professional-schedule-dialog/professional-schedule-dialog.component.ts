import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { Professional, WeeklySchedule } from '../../../../shared/models/domain.model';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { WeeklyScheduleEditor } from '../weekly-schedule-editor/weekly-schedule-editor.component';

export interface ProfessionalScheduleDialogData {
  tenantId: string;
  professional: Professional;
}

@Component({
  selector: 'app-professional-schedule-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
    WeeklyScheduleEditor,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'owner.schedule_edit_title' | translate }}</h2>
    <mat-dialog-content class="psd">
      <p class="psd__note">
        {{ 'owner.schedule_edit_note' | translate: { name: data.professional.name } }}
      </p>
      <app-weekly-schedule-editor
        [schedule]="data.professional.schedule"
        (valueChange)="onScheduleValue($event)"
        (validChange)="onScheduleValid($event)"
      />
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">
        {{ 'common.cancel' | translate }}
      </button>
      <button mat-flat-button [disabled]="!scheduleValid() || submitting()" (click)="submit()">
        @if (submitting()) {
          <mat-spinner diameter="20" />
        } @else {
          {{ 'owner.schedule_save' | translate }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .psd {
      padding-top: 4px;
    }
    .psd__note {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionalScheduleDialog {
  protected readonly submitting = signal(false);
  protected readonly scheduleValid = signal(false);

  protected readonly data = inject<ProfessionalScheduleDialogData>(MAT_DIALOG_DATA);
  private readonly dashboard = inject(DashboardService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ProfessionalScheduleDialog>);

  private schedule: WeeklySchedule | null = null;

  protected onScheduleValue(value: WeeklySchedule): void {
    this.schedule = value;
  }

  protected onScheduleValid(valid: boolean): void {
    this.scheduleValid.set(valid);
  }

  protected submit(): void {
    if (!this.schedule || !this.scheduleValid() || this.submitting()) return;
    this.submitting.set(true);
    this.dashboard
      .updateProfessional(this.data.tenantId, this.data.professional.id, this.data.professional.version, {
        schedule: this.schedule,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogRef.close(true);
          this.snackbar.open('owner.schedule_save_done', undefined, { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.message === 'string' ? err.error.message : 'owner.schedule_save_error';
          this.snackbar.open(detail, undefined, {
            duration: 4000,
            panelClass: 'snackbar-error',
          });
        },
      });
  }
}