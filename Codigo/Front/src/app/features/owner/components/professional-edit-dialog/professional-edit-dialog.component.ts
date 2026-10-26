import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { Professional } from '../../../../shared/models/domain.model';
import { DashboardService } from '../../../dashboard/services/dashboard.service';

export interface ProfessionalEditDialogData {
  tenantId: string;
  professional: Professional;
}

@Component({
  selector: 'app-professional-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'owner.edit_title' | translate }}</h2>
    <form [formGroup]="form" (submit)="submit()">
      <mat-dialog-content class="ped">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_name_label' | translate }}</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'owner.invite_title_label' | translate }}</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">
          {{ 'common.cancel' | translate }}
        </button>
        <button mat-flat-button [disabled]="form.invalid || submitting()">
          @if (submitting()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ 'owner.edit_save' | translate }}
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .ped {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 380px;
      padding-top: 8px;
    }
    @media (max-width: 520px) {
      .ped {
        min-width: 0;
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessionalEditDialog {
  protected readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    title: new FormControl('', {
      validators: [Validators.maxLength(80)],
    }),
  });

  protected readonly data = inject<ProfessionalEditDialogData>(MAT_DIALOG_DATA);
  private readonly dashboard = inject(DashboardService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ProfessionalEditDialog>);

  constructor() {
    this.form.controls['name'].setValue(this.data.professional.name);
    this.form.controls['title'].setValue(this.data.professional.title ?? '');
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    if (!v.name) return;

    this.submitting.set(true);
    this.dashboard
      .updateProfessional(this.data.tenantId, this.data.professional.id, this.data.professional.version, {
        name: v.name.trim(),
        title: v.title?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogRef.close(true);
          this.snackbar.open('owner.edit_save_done', undefined, { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.message === 'string' ? err.error.message : 'owner.edit_save_error';
          this.snackbar.open(detail, undefined, {
            duration: 4000,
            panelClass: 'snackbar-error',
          });
        },
      });
  }
}