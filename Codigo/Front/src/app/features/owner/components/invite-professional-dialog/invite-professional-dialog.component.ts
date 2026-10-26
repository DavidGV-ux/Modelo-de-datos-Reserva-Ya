import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { PlatformService } from '../../../platform/services/platform.service';
import { Service, WeeklySchedule } from '../../../../shared/models/domain.model';
import { WeeklyScheduleEditor } from '../weekly-schedule-editor/weekly-schedule-editor.component';

export interface InviteProfessionalDialogData {
  tenantId: string;
  services: Service[];
}

@Component({
  selector: 'app-invite-professional-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
    WeeklyScheduleEditor,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'owner.invite_title' | translate }}</h2>
    <form [formGroup]="form" (submit)="submit()">
      <mat-dialog-content class="invite">
        <p class="invite__note">{{ 'owner.invite_note' | translate }}</p>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_name_label' | translate }}</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_email_label' | translate }}</mat-label>
          <input matInput formControlName="email" type="email" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_title_label' | translate }}</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_services_label' | translate }}</mat-label>
          <mat-select formControlName="serviceIds" multiple>
            @for (service of activeServices(); track service.id) {
              <mat-option [value]="service.id">{{ service.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p class="invite__schedule-title">{{ 'owner.schedule_edit_title' | translate }}</p>
        <app-weekly-schedule-editor
          [schedule]="null"
          (valueChange)="onScheduleValue($event)"
          (validChange)="onScheduleValid($event)"
        />
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">
          {{ 'common.cancel' | translate }}
        </button>
        <button mat-flat-button [disabled]="form.invalid || scheduleInvalid() || submitting()">
          @if (submitting()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ 'owner.invite_submit' | translate }}
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .invite {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 380px;
      padding-top: 8px;
    }
    .invite__note {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
      margin: 0 0 12px;
    }
    .invite__schedule-title {
      margin: 16px 0 0;
      font-weight: 600;
    }
    @media (max-width: 520px) {
      .invite {
        min-width: 0;
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteProfessionalDialog {
  protected readonly submitting = signal(false);
  protected readonly scheduleInvalid = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    email: new FormControl('', {
      validators: [Validators.required, Validators.email],
    }),
    title: new FormControl('', {
      validators: [Validators.maxLength(80)],
    }),
    serviceIds: new FormControl<string[]>([], {
      validators: [Validators.required],
    }),
  });

  private readonly data = inject<InviteProfessionalDialogData>(MAT_DIALOG_DATA);
  private readonly platform = inject(PlatformService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<InviteProfessionalDialog>);

  private schedule: WeeklySchedule | null = null;

  protected activeServices(): Service[] {
    return this.data.services.filter((s) => s.active);
  }

  protected onScheduleValue(value: WeeklySchedule): void {
    this.schedule = value;
  }

  protected onScheduleValid(valid: boolean): void {
    this.scheduleInvalid.set(!valid);
  }

  submit(): void {
    if (this.form.invalid || this.scheduleInvalid()) return;
    const v = this.form.value;
    if (!v.name || !v.email || !v.serviceIds?.length) return;

    this.submitting.set(true);
    this.platform
      .inviteProfessional(this.data.tenantId, {
        name: v.name,
        email: v.email,
        title: v.title || undefined,
        serviceIds: v.serviceIds,
        weeklySchedule: this.schedule ?? undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogRef.close(true);
          this.snackbar.open('owner.invite_done', undefined, { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.message === 'string' ? err.error.message : 'owner.invite_error';
          this.snackbar.open(detail, undefined, {
            duration: 4000,
            panelClass: 'snackbar-error',
          });
        },
      });
  }
}