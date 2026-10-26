import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../../core/http/api.service';
import { AuthService } from '../../../../core/auth/auth.service';

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  habeasDataConsent: boolean;
}

function matchingPasswords(confirm: FormControl<string | null>) {
  return (control: import('@angular/forms').AbstractControl): { mismatch: true } | null => {
    const confirmVal = confirm.value?.trim() ?? '';
    if (!control.value?.trim() || confirmVal === control.value.trim()) return null;
    return { mismatch: true };
  };
}

@Component({
  selector: 'app-register-page',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TranslatePipe,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  protected readonly submitting = signal(false);

  private readonly password = new FormControl('', {
    nonNullable: false,
    validators: [Validators.required, Validators.minLength(8)],
  });
  private readonly confirm = new FormControl('', {
    nonNullable: false,
    validators: [Validators.required],
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: false,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    email: new FormControl('', {
      nonNullable: false,
      validators: [Validators.required, Validators.email],
    }),
    password: this.password,
    confirmPassword: this.confirm,
    habeasDataConsent: new FormControl<boolean>(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });

  constructor() {
    this.confirm.addValidators(matchingPasswords(this.password));
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;

    const value = this.form.getRawValue();
    const payload: RegisterPayload = {
      name: (value.name ?? '').trim(),
      email: (value.email ?? '').trim().toLowerCase(),
      password: value.password ?? '',
      confirmPassword: value.confirmPassword ?? '',
      habeasDataConsent: value.habeasDataConsent,
    };

    this.submitting.set(true);
    this.api.post<{ ok: true }>('/public/auth/register', payload).subscribe({
      next: () => void this.onRegistered(),
      error: (err: unknown) => {
        this.submitting.set(false);
        void this.onError(this.errorCode(err));
      },
    });
  }

  private async onRegistered(): Promise<void> {
    const { default: Swal } = await import('sweetalert2');
    await Swal.fire({
      icon: 'success',
      title: this.translate.instant('auth.register.success_title'),
      text: this.translate.instant('auth.register.success_text'),
      confirmButtonText: this.translate.instant('common.continue'),
    });
    this.auth.login().subscribe(() => undefined);
  }

  private async onError(code: string): Promise<void> {
    const { default: Swal } = await import('sweetalert2');
    const message =
      code === 'EMAIL_TAKEN'
        ? 'auth.register.error_email_taken'
        : code === 'RATE_LIMITED'
          ? 'auth.register.error_rate_limited'
          : 'auth.register.error_generic';
    await Swal.fire({
      icon: 'error',
      title: this.translate.instant('auth.register.error_title'),
      text: this.translate.instant(message),
      confirmButtonText: this.translate.instant('common.close'),
    });
  }

  private errorCode(err: unknown): string {
    const body = (err as { error?: { error?: { code?: string } } }).error?.error;
    return body?.code ?? 'UNKNOWN';
  }
}