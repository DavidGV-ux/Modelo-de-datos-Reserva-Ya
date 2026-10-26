import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { Currency } from '../../../../shared/models/domain.model';

export interface ServiceDialogData {
  tenantId: string;
  currency: Currency;
}

@Component({
  selector: 'app-service-dialog',
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
    <h2 mat-dialog-title>{{ 'dashboard.service_create_title' | translate }}</h2>
    <form [formGroup]="form" (submit)="submit()">
      <mat-dialog-content class="svc">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'dashboard.service_name_label' | translate }}</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'dashboard.service_description_label' | translate }}</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>

        <div class="svc__row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'dashboard.service_duration_label' | translate }}</mat-label>
            <input matInput formControlName="durationMinutes" type="number" min="1" />
            <mat-hint>{{ 'common.minutes' | translate }}</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'dashboard.service_price_label' | translate }}</mat-label>
            <input matInput formControlName="price" type="number" min="0" step="0.01" />
            <mat-hint>{{ data.currency }}</mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">
          {{ 'common.cancel' | translate }}
        </button>
        <button mat-flat-button [disabled]="form.invalid || submitting()">
          @if (submitting()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ 'dashboard.service_create_submit' | translate }}
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .svc {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 400px;
      padding-top: 8px;
    }
    .svc__row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 520px) {
      .svc {
        min-width: 0;
        width: 100%;
      }
      .svc__row {
        grid-template-columns: 1fr;
        gap: 4px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceDialog {
  protected readonly submitting = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      validators: [Validators.required, Validators.minLength(2)],
    }),
    description: new FormControl('', {
      validators: [Validators.maxLength(240)],
    }),
    durationMinutes: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    price: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0)],
    }),
  });

  protected readonly data = inject<ServiceDialogData>(MAT_DIALOG_DATA);
  private readonly dashboard = inject(DashboardService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ServiceDialog>);

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    if (v.name == null || v.durationMinutes == null || v.price == null) return;

    this.submitting.set(true);
    this.dashboard
      .createService(this.data.tenantId, {
        name: v.name,
        description: v.description || undefined,
        durationMinutes: v.durationMinutes,
        price: v.price,
        currency: this.data.currency,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogRef.close(true);
          this.snackbar.open('dashboard.service_created', undefined, { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          const detail =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'dashboard.service_error';
          this.snackbar.open(detail, undefined, {
            duration: 4000,
            panelClass: 'snackbar-error',
          });
        },
      });
  }
}