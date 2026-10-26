import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PlatformService } from '../../services/platform.service';

type CountryOption = { isoCode: string; name: string; phonecode: string; flag: string };

let phoneNsPromise: Promise<typeof import('libphonenumber-js')> | null = null;
function getPhoneNs(): Promise<typeof import('libphonenumber-js')> {
  return (phoneNsPromise ??= import('libphonenumber-js'));
}
const cityCache = new Map<string, string[]>();
let countryCache: CountryOption[] | null = null;

async function loadCountries(): Promise<CountryOption[]> {
  if (countryCache) return countryCache;
  const csc = await import('country-state-city');
  countryCache = csc.Country.getAllCountries()
    .map((c) => ({
      isoCode: c.isoCode,
      name: c.name,
      phonecode: String(c.phonecode ?? ''),
      flag: c.flag ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return countryCache;
}

async function loadCities(countryIso: string): Promise<string[]> {
  const cached = cityCache.get(countryIso);
  if (cached) return cached;
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
  cityCache.set(countryIso, list);
  return list;
}

@Component({
  selector: 'app-complete-profile-dialog',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'profile.complete_title' | translate }}</h2>
    <form [formGroup]="form" (submit)="submit()">
      <mat-dialog-content class="profile">
        <p class="profile__note">{{ 'profile.note' | translate }}</p>

        <mat-form-field appearance="outline" class="profile__field">
          <mat-label>{{ 'profile.phone_country_label' | translate }}</mat-label>
          <mat-select formControlName="phoneCountry" (selectionChange)="onPhoneCountryChange()">
            @for (country of countries(); track country.isoCode) {
              <mat-option [value]="country.isoCode">
                {{ country.flag }} {{ country.name }} (+{{ country.phonecode }})
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="profile__field">
          <mat-label>{{ 'profile.phone_label' | translate }}</mat-label>
          <span matPrefix class="profile__prefix">+{{ phoneCode() }}&nbsp;</span>
          <input
            matInput
            formControlName="phone"
            type="tel"
            autocomplete="tel-national"
            [placeholder]="'profile.phone_placeholder' | translate"
            (input)="onPhoneInput()"
            (blur)="onPhoneBlur()"
          />
          <mat-hint>{{ 'profile.phone_hint' | translate }}</mat-hint>
          @if (form.controls.phone.hasError('required')) {
            <mat-error>{{ 'profile.phone_required' | translate }}</mat-error>
          } @else if (form.controls.phone.hasError('invalid')) {
            <mat-error>{{ 'profile.phone_invalid' | translate }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="profile__field">
          <mat-label>{{ 'profile.city_country_label' | translate }}</mat-label>
          <mat-select formControlName="cityCountry" (selectionChange)="onCityCountryChange()">
            @for (country of countries(); track country.isoCode) {
              <mat-option [value]="country.isoCode">{{ country.flag }} {{ country.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="profile__field">
          <mat-label>{{ 'profile.city_label' | translate }}</mat-label>
          <input
            matInput
            formControlName="city"
            type="text"
            autocomplete="off"
            [matAutocomplete]="cityAuto"
            (input)="onCityInput($event)"
          />
          <mat-autocomplete #cityAuto="matAutocomplete">
            @for (city of filteredCities(); track city) {
              <mat-option [value]="city">{{ city }}</mat-option>
            }
          </mat-autocomplete>
          @if (cityCount() > 0) {
            <mat-hint>{{ 'profile.city_count_hint' | translate: { count: cityCount() } }}</mat-hint>
          }
          @if (form.controls.city.hasError('required')) {
            <mat-error>{{ 'profile.city_required' | translate }}</mat-error>
          } @else if (form.controls.city.hasError('notListed')) {
            <mat-error>{{ 'profile.city_not_listed' | translate }}</mat-error>
          }
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
            {{ 'profile.submit' | translate }}
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .profile {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
      min-width: 420px;
    }
    .profile__note {
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
      line-height: 1.5;
      margin: 0 0 16px;
    }
    .profile__prefix {
      color: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 520px) {
      .profile {
        min-width: 0;
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompleteProfileDialog {
  protected readonly submitting = signal(false);
  protected readonly countries = signal<CountryOption[]>([]);

  protected readonly cities = signal<string[]>([]);
  protected readonly cityQuery = signal('');
  protected readonly cityCount = computed(() => this.cities().length);
  protected readonly filteredCities = computed(() => {
    const all = this.cities();
    const q = this.cityQuery().toLowerCase().trim();
    if (!q) return all.slice(0, 200);
    return all.filter((c) => c.toLowerCase().includes(q)).slice(0, 200);
  });

  protected readonly form = new FormGroup({
    phoneCountry: new FormControl('CO', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    cityCountry: new FormControl('CO', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
  });

  protected readonly phoneCode = computed(
    () =>
      this.countries().find((c) => c.isoCode === this.form.controls.phoneCountry.value)?.phonecode ?? '',
  );

  private readonly platform = inject(PlatformService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly destroy = inject(DestroyRef);
  private readonly dialogRef = inject(MatDialogRef<CompleteProfileDialog>);

  constructor() {
    void this.init();
    this.form.controls.phone.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.validatePhone());
    this.form.controls.city.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.validateCity());
  }

  private async init(): Promise<void> {
    const list = await loadCountries();
    this.countries.set(list);
    await this.loadCitiesFor('CO');
  }

  private async loadCitiesFor(countryIso: string): Promise<void> {
    this.cities.set(await loadCities(countryIso));
    this.validateCity();
  }

  protected async onPhoneCountryChange(): Promise<void> {
    this.form.controls.phone.reset('');
    this.validatePhone();
  }

  protected onCityCountryChange(): void {
    this.form.controls.city.reset('');
    void this.loadCitiesFor(this.form.controls.cityCountry.value);
  }

  protected onCityInput(event: Event): void {
    this.cityQuery.set((event.target as HTMLInputElement).value);
  }

  protected async onPhoneInput(): Promise<void> {
    const { formatIncompletePhoneNumber } = await getPhoneNs();
    const value = this.form.controls.phone.value ?? '';
    const formatted = formatIncompletePhoneNumber(value, this.phoneCountryCode());
    if (formatted !== value) {
      this.form.controls.phone.setValue(formatted, { emitEvent: false });
    }
    this.validatePhone();
  }

  protected onPhoneBlur(): void {
    this.validatePhone();
  }

  private phoneCountryCode(): import('libphonenumber-js').CountryCode | undefined {
    return this.form.controls.phoneCountry.value as import('libphonenumber-js').CountryCode | undefined;
  }

  private async validatePhone(): Promise<void> {
    const control = this.form.controls.phone;
    const value = control.value ?? '';
    if (!value) {
      control.setErrors({ required: true });
      return;
    }
    const { isValidPhoneNumber } = await getPhoneNs();
    const valid = isValidPhoneNumber(value, this.phoneCountryCode());
    control.setErrors(valid ? null : { invalid: true });
  }

  private validateCity(): void {
    const control = this.form.controls.city;
    // La ciudad es opcional: solo personaliza el saludo. El teléfono es lo que
    // dispara el envío de la bienvenida por WhatsApp.
    control.setErrors(null);
  }

  protected async submit(): Promise<void> {
    await this.validatePhone();
    this.validateCity();
    if (this.form.invalid) return;

    const city = this.form.controls.city.value?.trim() ?? '';
    const { parsePhoneNumber } = await getPhoneNs();
    const parsed = parsePhoneNumber(this.form.controls.phone.value ?? '', this.phoneCountryCode());
    const phone = parsed?.number;
    if (!phone) {
      void this.translate
        .get('profile.phone_invalid')
        .subscribe((msg) => this.snackbar.open(msg, undefined, { duration: 4000, panelClass: 'snackbar-error' }));
      return;
    }

    this.submitting.set(true);
    this.platform.saveMeProfile({ phone, city }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogRef.close(true);
        this.snackbar.open('profile.done', undefined, { duration: 5000 });
      },
      error: (err) => {
        this.submitting.set(false);
        const detail =
          typeof err?.error?.message === 'string' ? err.error.message : 'profile.error';
        this.snackbar.open(detail, undefined, {
          duration: 4000,
          panelClass: 'snackbar-error',
        });
      },
    });
  }
}