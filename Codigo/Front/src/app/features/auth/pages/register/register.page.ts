import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { startWith } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../../core/http/api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { buildWhatsappDeepLink } from '../../../../shared/utils/qr-local';

interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  password: string;
  confirmPassword: string;
  habeasDataConsent: boolean;
}

interface PasswordStrength {
  level: 0 | 1 | 2 | 3 | 4;
  labelKey: string;
}

/**
 * Valida la longitud del texto ya recortado, igual que hace el backend
 * (`trim().min(2).max(120)`), para que un nombre de solo espacios no pase.
 */
function trimmedLength(min: number, max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value === null || control.value === undefined) return null;

    const length = String(control.value).trim().length;
    if (length < min) {
      return { trimmedMin: { requiredLength: min, actualLength: length } };
    }
    if (length > max) {
      return { trimmedMax: { requiredLength: max, actualLength: length } };
    }
    return null;
  };
}

/** Compara la confirmación contra la contraseña y se recalcula si esta cambia. */
function passwordsMatch(password: AbstractControl): ValidatorFn {
  return (confirm: AbstractControl): ValidationErrors | null => {
    const value = typeof confirm.value === 'string' ? confirm.value : '';
    if (!value) return null;
    return value === password.value ? null : { mismatch: true };
  };
}

/**
 * Complejidad mínima: al menos una letra y un dígito.
 * Mismo criterio que el backend (`zod`: password must contain letters and digits).
 */
function passwordComplexity(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  if (!value) return null;
  return /[a-zA-Z]/.test(value) && /\d/.test(value) ? null : { complexity: true };
}

/** Los nombres no admiten dígitos. */
function noDigits(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  if (!value) return null;
  return /\d/.test(value) ? { noDigits: true } : null;
}

/** Los nombres no admiten HTML (evita XSS almacenado en salidas fuera de Angular). */
function noHtml(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  if (!value) return null;
  return /[<>]/.test(value) ? { noHtml: true } : null;
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
    MatTooltipModule,
    MatSelectModule,
    MatAutocompleteModule,
  ],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly destroy = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly step = signal<'form' | 'code' | 'verified'>('form');
  protected readonly verificationToken = signal('');
  protected readonly code = signal('');
  protected readonly resendCooldown = signal(0);
  protected readonly changingPhone = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly verifying = signal(false); // polling de verificación por WhatsApp
  protected readonly autoLoginFailed = signal(false);
  protected readonly verificationExpired = signal(false);
  /** El código mostrado expiró: aviso inline + reenvío inmediato disponible. */
  protected readonly codeExpired = signal(false);
  protected readonly submitLabelKey = computed(() =>
    this.submitting() ? 'auth.register.submitting' : 'auth.register.submit',
  );
  private readonly formEl = viewChild<ElementRef<HTMLFormElement>>('registerForm');
  /** Número del bot de WhatsApp de ReservaYa (+57 312 3054870). */
  private readonly whatsappBotPhone = '573123054870';
  /** Datos del registro para login automático tras verificación. */
  private readonly registerEmail = signal<string>('');
  private readonly registerPassword = signal<string>('');
  private verificationPollInterval: any;
  private autoLoginInProgress = false;
  protected readonly countries = signal<{ isoCode: string; name: string; phonecode: string; flag: string }[]>([]);
  protected readonly phoneCode = computed(() => this.countries().find((c) => c.isoCode === this.form.controls.phoneCountry.value)?.phonecode ?? '');
  protected readonly cities = signal<string[]>([]);
  protected readonly cityQuery = signal('');
  protected readonly cityCount = computed(() => this.cities().length);
  protected readonly filteredCities = computed(() => {
    const all = this.cities();
    const q = this.cityQuery().toLowerCase().trim();
    if (!q) return all.slice(0, 200);
    return all.filter((c) => c.toLowerCase().includes(q)).slice(0, 200);
  });

  protected readonly benefits = [
    {
      icon: 'event_available',
      title: 'auth.register.benefit_1_title',
      text: 'auth.register.benefit_1_text',
    },
    {
      icon: 'payments',
      title: 'auth.register.benefit_2_title',
      text: 'auth.register.benefit_2_text',
    },
    {
      icon: 'workspace_premium',
      title: 'auth.register.benefit_3_title',
      text: 'auth.register.benefit_3_text',
    },
  ] as const;

  private readonly password = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.minLength(8),
      Validators.maxLength(72),
      passwordComplexity,
    ],
  });
  private readonly confirm = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(72)],
  });

  protected readonly passwordValue = toSignal(
    this.password.valueChanges.pipe(startWith(this.password.value)),
    { initialValue: '' },
  );

  protected readonly strength = computed<PasswordStrength>(() => {
    const value = this.passwordValue();
    if (!value) return { level: 0, labelKey: '' };

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    const level = Math.min(4, Math.max(1, Math.ceil((score * 4) / 5))) as PasswordStrength['level'];
    const labels = ['', 'weak', 'fair', 'good', 'strong'] as const;
    return { level, labelKey: `auth.register.strength_${labels[level]}` };
  });

  protected readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedLength(2, 60), Validators.maxLength(60), noDigits, noHtml],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, trimmedLength(2, 60), Validators.maxLength(60), noDigits, noHtml],
    }),
    phoneCountry: new FormControl('CO', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(7), Validators.pattern(/^[0-9]+$/)] }),
    cityCountry: new FormControl('CO', { nonNullable: true }),
    city: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^[^0-9]*$/)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    password: this.password,
    confirmPassword: this.confirm,
    habeasDataConsent: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });

  constructor() {
    void this.loadCountries();
    this.confirm.addValidators(passwordsMatch(this.password));

    this.password.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
      if (this.confirm.value) {
        this.confirm.updateValueAndValidity({ emitEvent: false });
      }
    });

    // Si el correo estaba marcado como registrado, al editarlo se limpia el error.
    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        const control = this.form.controls.email;
        const errors = control.errors;
        if (!errors?.['taken']) return;

        const { taken: _taken, ...rest } = errors;
        control.setErrors(Object.keys(rest).length ? rest : null);
      });

    // Limpiar polling al destruir el componente.
    this.destroy.onDestroy(() => this.stopVerificationPolling());
  }

  protected normalizeFirstName(): void {
    const control = this.form.controls.firstName;
    const normalized = control.value.trim();
    if (normalized !== control.value) control.setValue(normalized);
  }

  protected normalizeLastName(): void {
    const control = this.form.controls.lastName;
    const normalized = control.value.trim();
    if (normalized !== control.value) control.setValue(normalized);
  }

  protected normalizeEmail(): void {
    const control = this.form.controls.email;
    const normalized = control.value.trim().toLowerCase();
    if (normalized !== control.value) control.setValue(normalized);
  }

  private async loadCountries(): Promise<void> {
    try {
      const csc = await import('country-state-city');
      const list = csc.Country.getAllCountries()
        .map((c: any) => ({
          isoCode: c.isoCode,
          name: c.name,
          phonecode: String(c.phonecode ?? ''),
          flag: c.flag ?? '',
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'es'));
      this.countries.set(list);
      await this.loadCitiesFor('CO');
    } catch {
      this.countries.set([{ isoCode: 'CO', name: 'Colombia', phonecode: '57', flag: '' }]);
    }
  }

  private async loadCitiesFor(countryIso: string): Promise<void> {
    try {
      const csc = await import('country-state-city');
      const seen = new Set<string>();
      const list: string[] = [];
      for (const state of csc.State.getStatesOfCountry(countryIso)) {
        for (const city of csc.City.getCitiesOfState(countryIso, state.isoCode)) {
          const name = city.name.trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          list.push(name);
        }
      }
      list.sort((a, b) => a.localeCompare(b, 'es'));
      this.cities.set(list);
    } catch {
      this.cities.set([]);
    }
  }

  protected onCityCountryChange(): void {
    this.form.controls.city.reset('');
    void this.loadCitiesFor(this.form.controls.cityCountry.value);
  }

  protected onCityInput(event: Event): void {
    this.cityQuery.set((event.target as HTMLInputElement).value);
  }

  protected normalizePhone(): void {
    const control = this.form.controls.phone;
    const normalized = control.value.trim();
    if (normalized !== control.value) control.setValue(normalized);
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      await this.showValidationSummary();
      this.focusFirstInvalid();
      return;
    }

    const value = this.form.getRawValue();
    const phone = `+${this.phoneCode()}${value.phone.trim().replace(/^\+/, '')}`;
    // Guardar credenciales para login automático tras verificación de WhatsApp.
    this.registerEmail.set(value.email.trim().toLowerCase());
    this.registerPassword.set(value.password);
    const payload: RegisterPayload = {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim().toLowerCase(),
      phone,
      city: value.city.trim(),
      password: value.password,
      confirmPassword: value.confirmPassword,
      habeasDataConsent: value.habeasDataConsent,
    };

    this.submitting.set(true);
    this.api
      .post<{ ok: true; id: string; verificationToken: string }>('/public/auth/register', payload)
      .subscribe({
        next: (res) => void this.onRegistered(res.id, res.verificationToken),
        error: (err: unknown) => {
          this.submitting.set(false);
          void this.onError(this.errorCode(err));
        },
      });
  }

  protected login(): void {
    this.auth.login().subscribe({ error: () => undefined });
  }

  private async onRegistered(id: string, verificationToken: string): Promise<void> {
    this.verificationToken.set(id);
    this.code.set(verificationToken);
    this.submitting.set(false);
    // Si el registro venía verificado por WhatsApp pero no completado, el back
    // lo completa aquí: pasar directo al login automático.
    if (!verificationToken) {
      this.step.set('verified');
      await this.autoLogin();
      return;
    }
    this.step.set('code');
    void this.startResendCooldown(240);
    // Empezar a vigilar la verificación de inmediato: el usuario puede enviar
    // el código desde WhatsApp en cualquier momento (botón o QR).
    this.startVerificationPolling();
  }

  /**
   * Inicia el polling para detectar cuando el usuario verifica su número por WhatsApp.
   * Cada 3 segundos consulta el estado del registro pendiente.
   */
  private startVerificationPolling(): void {
    const id = this.verificationToken();
    if (!id) return;

    this.stopVerificationPolling();
    this.verifying.set(true);

    const check = async (): Promise<void> => {
      if (this.step() === 'verified') return;
      try {
        const res = await firstValueFrom(
          this.api.get<{
            ok: boolean;
            completed: boolean;
            verified: boolean;
            expired?: boolean;
            codeExpired?: boolean;
          }>(`/public/auth/verify-status/${id}`),
        );
        if (res?.completed) {
          this.stopVerificationPolling();
          this.step.set('verified');
          await this.autoLogin();
          return;
        }
        if (res?.expired) {
          // El registro pendiente ya no existe (TTL o id inválido): volver al
          // formulario (conserva los valores) para reintentar el registro.
          this.stopVerificationPolling();
          this.verificationExpired.set(true);
          this.step.set('verified');
          return;
        }
        if (res?.codeExpired) {
          // El código ya no sirve pero el registro sigue vivo: dejar de esperar
          // y ofrecer reenviar (disponible de inmediato, sin cooldown) o
          // cambiar el número.
          this.stopVerificationPolling();
          this.codeExpired.set(true);
          this.resendCooldown.set(0);
          return;
        }
      } catch {
        // Ignorar errores de polling, seguir intentando.
      }
    };

    this.verificationPollInterval = setInterval(() => void check(), 3000);
    void check();
  }

  /** Detiene el polling de verificación. */
  private stopVerificationPolling(): void {
    if (this.verificationPollInterval) {
      clearInterval(this.verificationPollInterval);
      this.verificationPollInterval = null;
    }
    this.verifying.set(false);
  }

  /**
   * Inicia sesión automáticamente con las credenciales del registro y entra
   * directo a la app, sin pedir al usuario un clic adicional.
   */
  protected async autoLogin(): Promise<void> {
    if (this.autoLoginInProgress) return;

    const email = this.registerEmail();
    const password = this.registerPassword();
    if (!email || !password) {
      this.autoLoginFailed.set(true);
      return;
    }

    this.autoLoginInProgress = true;
    this.autoLoginFailed.set(false);
    this.submitting.set(true);

    try {
      const ok = await this.auth.loginWithPassword(email, password);
      if (ok) {
        // No conservar la contraseña en memoria tras iniciar sesión.
        this.registerPassword.set('');
        await this.router.navigateByUrl('/app', { replaceUrl: true });
        return;
      }
      this.autoLoginFailed.set(true);
    } catch {
      // Un reintento por si la cuenta terminó de crearse justo después del polling.
      try {
        await this.delay(1200);
        if (await this.auth.loginWithPassword(email, password)) {
          this.registerPassword.set('');
          await this.router.navigateByUrl('/app', { replaceUrl: true });
          return;
        }
      } catch {
        /* se muestra el acceso manual */
      }
      this.autoLoginFailed.set(true);
    } finally {
      this.autoLoginInProgress = false;
      this.submitting.set(false);
    }
  }

  /** Vuelve al formulario cuando el código expiró antes de verificar. */
  protected restartRegistration(): void {
    this.verificationExpired.set(false);
    this.autoLoginFailed.set(false);
    this.codeExpired.set(false);
    this.verificationToken.set('');
    this.code.set('');
    this.step.set('form');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Abre WhatsApp (app móvil o Web) con el mensaje de verificación predefinido
   * que incluye el código generado por la aplicación. El usuario solo debe
   * enviarlo desde su número para que la cuenta quede verificada.
   */
  protected openWhatsAppVerification(): void {
    const code = this.code().trim();
    const message = this.translate.instant('auth.register.whatsapp_verify_message', { code });
    const encoded = encodeURIComponent(message);
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const url = isMobile
      ? this.whatsappDeepLink()
      : `https://web.whatsapp.com/send?phone=${this.whatsappBotPhone}&text=${encoded}&app_absent=1`;
    // Abrir WhatsApp en una nueva pestaña para no salir del registro.
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Si el navegador bloqueó el popup, navegar en la misma pestaña como fallback.
      window.location.href = url;
    }
    // Iniciar polling para detectar verificación completada por WhatsApp.
    void this.startVerificationPolling();
  }

  /** Enlace wa.me con el código de verificación, sin servicios QR de terceros. */
  protected readonly whatsappDeepLink = computed(() => {
    const code = this.code().trim();
    const message = this.translate.instant('auth.register.whatsapp_verify_message', { code });
    return buildWhatsappDeepLink(this.whatsappBotPhone, message);
  });

  protected async resendCode(): Promise<void> {
    if (this.resendCooldown() > 0) return;
    this.submitting.set(true);
    this.api.post<{ ok: true; retryAfterSeconds?: number; verificationToken?: string }>('/public/auth/resend-code', {
      id: this.verificationToken(),
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.verificationToken) this.code.set(res.verificationToken);
        this.codeExpired.set(false);
        void this.startResendCooldown(res.retryAfterSeconds ?? 240);
        this.startVerificationPolling();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        // Cooldown del back (mismo número recién reenviado): sincronizar el
        // contador y avisar, sin bloquear el flujo.
        const code = this.errorCode(err);
        if (code === 'CODE_RATE_LIMITED') {
          const seconds = this.retryAfterSeconds(err) ?? 240;
          void this.startResendCooldown(seconds);
          void this.onError(code, seconds);
          return;
        }
        void this.onError(code);
      },
    });
  }

  protected async changePhone(): Promise<void> {
    this.changingPhone.set(true);
  }

  protected async confirmChangePhone(newPhone: string): Promise<void> {
    const phone = `+${this.phoneCode()}${newPhone.trim().replace(/^\+/, '')}`;
    this.submitting.set(true);
    this.api.post<{ ok: true; retryAfterSeconds?: number; verificationToken?: string }>('/public/auth/resend-code', {
      id: this.verificationToken(),
      phone,
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.changingPhone.set(false);
        if (res.verificationToken) this.code.set(res.verificationToken);
        this.codeExpired.set(false);
        void this.startResendCooldown(res.retryAfterSeconds ?? 240);
        this.startVerificationPolling();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        void this.onError(this.errorCode(err), this.retryAfterSeconds(err));
      },
    });
  }

  private async startResendCooldown(seconds: number): Promise<void> {
    this.resendCooldown.set(seconds);
    const interval = setInterval(() => {
      const v = this.resendCooldown();
      if (v <= 1) {
        this.resendCooldown.set(0);
        clearInterval(interval);
      } else {
        this.resendCooldown.set(v - 1);
      }
    }, 1000);
  }

  private async onError(code: string, retryAfterSeconds?: number): Promise<void> {
    if (code === 'EMAIL_TAKEN') {
      const email = this.form.controls.email;
      email.setErrors({ ...(email.errors ?? {}), taken: true });
      email.markAsTouched();
    }
    if (code === 'PHONE_TAKEN') {
      const phone = this.form.controls.phone;
      phone.setErrors({ ...(phone.errors ?? {}), taken: true });
      phone.markAsTouched();
    }

    const { default: Swal } = await import('sweetalert2');
    const messageKey =
      code === 'EMAIL_TAKEN'
        ? 'auth.register.error_email_taken'
        : code === 'PHONE_TAKEN'
          ? 'auth.register.error_phone_taken'
          : code === 'RATE_LIMITED'
            ? 'auth.register.error_rate_limited'
            : code === 'CODE_RATE_LIMITED'
              ? 'auth.register.error_code_rate_limited'
              : code === 'TOO_MANY_ATTEMPTS'
                ? 'auth.register.error_too_many_attempts'
                : code === 'NO_PENDING_REGISTRATION'
                  ? 'auth.register.error_no_pending'
                  : 'auth.register.error_generic';
    const messageParams =
      code === 'CODE_RATE_LIMITED' ? { seconds: Math.ceil((retryAfterSeconds ?? 0) / 60) } : undefined;

    const result = await Swal.fire({
      icon: 'error',
      title: this.translate.instant('auth.register.error_title'),
      text: this.translate.instant(messageKey, messageParams),
      confirmButtonText: this.translate.instant(
        code === 'EMAIL_TAKEN' ? 'common.login' : 'common.close',
      ),
      confirmButtonColor: this.brandColor(),
      showCancelButton: code === 'EMAIL_TAKEN',
      cancelButtonText: this.translate.instant('common.close'),
      customClass: { popup: 'ry-swal' },
    });

    if (code === 'EMAIL_TAKEN' && result.isConfirmed) {
      this.login();
      return;
    }

    if (code === 'EMAIL_TAKEN') this.focusControl('email');
  }

  private async showValidationSummary(): Promise<void> {
    const issues = this.validationIssues();
    if (!issues.length) return;

    const { default: Swal } = await import('sweetalert2');
    const items = issues
      .map((key) => `<li>${this.escapeHtml(this.translate.instant(key))}</li>`)
      .join('');
    const lead = this.escapeHtml(this.translate.instant('auth.register.validation_text'));

    await Swal.fire({
      icon: 'warning',
      title: this.translate.instant('auth.register.validation_title'),
      html: `<p class="ry-swal__lead">${lead}</p><ul class="ry-swal__list">${items}</ul>`,
      confirmButtonText: this.translate.instant('auth.register.validation_action'),
      confirmButtonColor: this.brandColor(),
      customClass: { popup: 'ry-swal' },
    });
  }

  private validationIssues(): string[] {
    const controls = this.form.controls;
    const issues: string[] = [];

    const firstName = controls.firstName;
    if (firstName.hasError('required')) issues.push('auth.register.first_name_required');
    else if (firstName.hasError('trimmedMin')) issues.push('auth.register.first_name_min');
    else if (firstName.hasError('trimmedMax') || firstName.hasError('maxlength')) {
      issues.push('auth.register.first_name_max');
    } else if (firstName.hasError('noHtml')) {
      issues.push('auth.register.first_name_no_html');
    } else if (firstName.hasError('noDigits')) {
      issues.push('auth.register.first_name_no_digits');
    }

    const lastName = controls.lastName;
    if (lastName.hasError('required')) issues.push('auth.register.last_name_required');
    else if (lastName.hasError('trimmedMin')) issues.push('auth.register.last_name_min');
    else if (lastName.hasError('trimmedMax') || lastName.hasError('maxlength')) {
      issues.push('auth.register.last_name_max');
    } else if (lastName.hasError('noHtml')) {
      issues.push('auth.register.last_name_no_html');
    } else if (lastName.hasError('noDigits')) {
      issues.push('auth.register.last_name_no_digits');
    }

    const email = controls.email;
    if (email.hasError('required')) issues.push('auth.register.email_required');
    else if (email.hasError('taken')) issues.push('auth.register.email_taken');
    else if (email.hasError('email') || email.hasError('maxlength')) {
      issues.push('auth.register.email_invalid');
    }

    const password = controls.password;
    if (password.hasError('required')) issues.push('auth.register.password_required');
    else if (password.hasError('minlength')) issues.push('auth.register.password_min');
    else if (password.hasError('maxlength')) issues.push('auth.register.password_max');
    else if (password.hasError('complexity')) issues.push('auth.register.password_complexity');

    const confirm = controls.confirmPassword;
    if (confirm.hasError('required')) issues.push('auth.register.confirm_required');
    else if (confirm.hasError('mismatch')) issues.push('auth.register.confirm_mismatch');

    if (controls.habeasDataConsent.hasError('required')) {
      issues.push('auth.register.consent_required');
    }

    const city = controls.city;
    if (city.hasError('pattern')) {
      issues.push('auth.register.city_invalid');
    }

    return issues;
  }

  private focusFirstInvalid(): void {
    const root = this.formEl()?.nativeElement;
    const field = root?.querySelector<HTMLElement>('[formControlName].ng-invalid');
    if (field) this.focusElement(field);
  }

  private focusControl(name: string): void {
    const root = this.formEl()?.nativeElement;
    const field = root?.querySelector<HTMLElement>(`[formControlName="${name}"]`);
    if (field) this.focusElement(field);
  }

  private focusElement(field: HTMLElement): void {
    const target = field.matches('input, textarea, select')
      ? field
      : field.querySelector<HTMLElement>('input, textarea, select');

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    target?.focus();
    target?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }

  private brandColor(): string {
    if (typeof document === 'undefined') return '#2e7d32';
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--mat-sys-primary')
      .trim();
    return color || '#2e7d32';
  }

  private escapeHtml(value: string): string {
    const chars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return value.replace(/[&<>"']/g, (char) => chars[char] ?? char);
  }

  private errorCode(err: unknown): string {
    const body = (err as { error?: { error?: { code?: string } } }).error?.error;
    return body?.code ?? 'UNKNOWN';
  }

  /** Segundos que el back pide esperar tras un error de rate limit. */
  private retryAfterSeconds(err: unknown): number | undefined {
    const seconds = (err as { error?: { error?: { retryAfterSeconds?: number } } }).error?.error
      ?.retryAfterSeconds;
    return typeof seconds === 'number' ? seconds : undefined;
  }
}
