import { ChangeDetectionStrategy, Component, OnInit, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantService, tenantSlugFromSnapshot } from '../../services/tenant.service';
import { PortalDataService } from '../../services/portal-data.service';
import { AvailabilityService, SlotView } from '../../services/availability.service';
import { BookingService } from '../../services/booking.service';
import { PaymentSessionService, PaymentSessionResult } from '../../services/payment-session.service';
import { WompiCheckoutService } from '../../services/wompi-checkout.service';
import { Appointment, Professional, Service } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { BookingIntent } from '../../../../core/http/api-mappers';

interface SelectionEvent<T> {
  value: T;
}

interface WompiCheckoutResult {
  transaction?: { status?: string };
}

@Component({
  selector: 'app-booking-page',
  imports: [
    ReactiveFormsModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
    MoneyPipe,
    RouterLink,
  ],
  template: `
    <div class="booking">
      <div class="booking__head">
        <h1>{{ 'booking.title' | translate }}</h1>
        <p>{{ tenant()?.name }} · {{ 'booking.payment_timeout' | translate: { minutes: tenant()?.settings?.paymentTimeoutMinutes ?? 15 } }}</p>
      </div>

      <mat-stepper linear #stepper="matStepper">
        <mat-step [completed]="serviceDone()" [editable]="true">
          <ng-template matStepLabel>{{ 'booking.step_service' | translate }}</ng-template>

          <div class="booking__field-title">{{ 'booking.select_service' | translate }}</div>
          <mat-radio-group class="booking__options booking__options--services" (change)="onServiceChange($event)">
            @for (service of services(); track service.id) {
              <div class="booking__option-card">
                <mat-radio-button [value]="service.id" [checked]="selectedService()?.id === service.id">
                  <div class="booking__option">
                    <span class="booking__option-name">{{ service.name }}</span>
                    <span class="booking__option-meta">
                      {{ service.durationMinutes }} {{ 'common.minutes' | translate }} ·
                      {{ service.price | appMoney: tenant()?.currency }}
                    </span>
                  </div>
                </mat-radio-button>
              </div>
            }
          </mat-radio-group>

          @if (selectedService()) {
            <div class="booking__field-title">{{ 'booking.select_professional' | translate }}</div>
            <mat-radio-group class="booking__options" (change)="onProfessionalChange($event)">
              @for (professional of professionals(); track professional.id) {
                <div>
                  <mat-radio-button [value]="professional.id" [checked]="selectedProfessional()?.id === professional.id">
                    <div class="booking__option">
                      <span class="booking__option-name">{{ professional.name }}</span>
                      <span class="booking__option-meta">{{ professional.title }}</span>
                    </div>
                  </mat-radio-button>
                </div>
              }
            </mat-radio-group>
          }

          <div class="booking__nav">
            <button mat-flat-button matStepperNext [disabled]="!serviceDone()">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <mat-step [completed]="slotDone()" [editable]="true">
          <ng-template matStepLabel>{{ 'booking.step_schedule' | translate }}</ng-template>

          <div class="booking__field-title">{{ 'booking.select_day' | translate }}</div>
          <div class="slot-days">
            @for (day of days(); track day.getTime()) {
              <button
                mat-stroked-button
                class="slot-days__day"
                [class.slot-days__day--active]="selectedDate()?.getTime() === day.getTime()"
                (click)="onDaySelect(day)"
              >
                <span class="slot-days__weekday">{{ weekdayLabel(day) }}</span>
                <span class="slot-days__date">{{ dayLabel(day) }}</span>
              </button>
            }
          </div>

          @if (slots().length) {
            <div class="booking__field-title">{{ 'booking.select_time' | translate }}</div>
            <div class="slot-grid">
              @for (slot of slots(); track slot.start.getTime()) {
                @if (slot.available) {
                  <button
                    mat-stroked-button
                    class="slot-grid__slot"
                    [class.slot-grid__slot--active]="isSelectedSlot(slot)"
                    (click)="onSlotSelect(slot)"
                  >
                    {{ slotTimeLabel(slot.start) }}
                  </button>
                }
              }
            </div>
            @if (!hasAvailableSlots()) {
              <p class="booking__empty">{{ 'common.noAvailability' | translate }}</p>
            }
          }

          <div class="booking__nav">
            <button mat-stroked-button matStepperPrevious>{{ 'common.back' | translate }}</button>
            <button mat-flat-button matStepperNext [disabled]="!slotDone()">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <mat-step [completed]="contactForm.valid" [editable]="true">
          <ng-template matStepLabel>{{ 'booking.step_contact' | translate }}</ng-template>

          <div class="booking__field-title">{{ 'booking.contact_title' | translate }}</div>
          <form [formGroup]="contactForm" class="booking-form">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_name' | translate }}</mat-label>
              <input matInput formControlName="name" autocomplete="name" />
              @if (contactForm.controls['name'].hasError('required')) {
                <mat-error>{{ 'booking.contact_name' | translate }} *</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_phone' | translate }}</mat-label>
              <input matInput formControlName="phone" autocomplete="tel" placeholder="+57 300 000 0000" />
              @if (contactForm.controls['phone'].hasError('required')) {
                <mat-error>{{ 'booking.contact_phone' | translate }} *</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_email' | translate }}</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="email" />
              @if (contactForm.controls['email'].hasError('email')) {
                <mat-error>Email</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_document' | translate }}</mat-label>
              <input matInput formControlName="documentId" autocomplete="off" placeholder="CC / TI / CE" />
              <mat-hint>{{ 'booking.contact_document_hint' | translate }}</mat-hint>
            </mat-form-field>

            @if (!authenticated()) {
              <div class="booking-form__register">
                <mat-icon>account_circle</mat-icon>
                <span>
                  <strong>{{ 'booking.register_prompt_title' | translate }}</strong>
                  {{ 'booking.register_prompt' | translate }}
                  <a class="booking-form__register-link" [routerLink]="['/crear-negocio']">
                    {{ 'booking.register_here' | translate }}
                  </a>
                </span>
              </div>
            }

            <div class="booking-form__habeas">
              <mat-checkbox formControlName="habeasData" color="primary">
                <strong>{{ 'booking.habeas_label' | translate }}</strong>
              </mat-checkbox>
              <p>{{ 'booking.habeas_detail' | translate }}</p>
            </div>
          </form>

          <div class="booking__summary">
            <h3>{{ 'booking.summary_title' | translate }}</h3>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_service' | translate }}</span>
              <strong>{{ selectedService()?.name }}</strong>
            </div>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_professional' | translate }}</span>
              <strong>{{ selectedProfessional()?.name }}</strong>
            </div>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_date' | translate }}</span>
              <strong>{{ selectedSlot() ? fullDateLabel(selectedDate()!) : '—' }}</strong>
            </div>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_time' | translate }}</span>
              <strong>{{ selectedSlot() ? slotTimeLabel(selectedSlot()!.start) : '—' }}</strong>
            </div>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_duration' | translate }}</span>
              <strong>{{ selectedService()?.durationMinutes }} {{ 'common.minutes' | translate }}</strong>
            </div>
            <div class="booking__summary-row">
              <span>{{ 'booking.summary_price' | translate }}</span>
              <strong>{{ selectedService()?.price | appMoney: tenant()?.currency }}</strong>
            </div>
            <div class="booking__summary-row booking__summary-row--total">
              <span>{{ 'booking.summary_upfront' | translate: { percent: upfrontPercent() } }}</span>
              <strong>{{ upfrontAmount() | appMoney: tenant()?.currency }}</strong>
            </div>
          </div>

          <div class="booking__nav">
            <button mat-stroked-button matStepperPrevious>{{ 'common.back' | translate }}</button>
            <button mat-flat-button matStepperNext [disabled]="contactForm.invalid">
              {{ 'common.next' | translate }}
            </button>
          </div>
        </mat-step>

        <mat-step [completed]="paymentDone()">
          <ng-template matStepLabel>{{ 'booking.step_payment' | translate }}</ng-template>

          <div class="payment">
            <h3>{{ 'booking.payment_title' | translate }}</h3>
            <p>{{ 'booking.payment_description' | translate }}</p>

            <div class="payment__amount">
              <span>{{ 'booking.pay_mode' | translate }}</span>
            </div>
            <mat-radio-group class="payment__modes" (change)="onPaymentMode($event)">
              <div class="payment__mode">
                <mat-radio-button value="advance" [checked]="selectedPaymentMode() === 'advance'">
                  <span>{{ 'booking.pay_advance' | translate }}</span>
                  <strong>{{ upfrontAmount() | appMoney: tenant()?.currency }}</strong>
                </mat-radio-button>
              </div>
              <div class="payment__mode">
                <mat-radio-button value="full" [checked]="selectedPaymentMode() === 'full'">
                  <span>{{ 'booking.pay_full' | translate }}</span>
                  <strong>{{ fullAmount() | appMoney: tenant()?.currency }}</strong>
                </mat-radio-button>
              </div>
            </mat-radio-group>

            @if (selectedPaymentMode() === 'advance') {
              <div class="payment__note">
                <mat-icon>info</mat-icon>
                <span>
                  {{ 'booking.payment_commission' | translate }}
                  <br />
                  <em>{{ 'booking.payment_sandbox' | translate }}</em>
                </span>
              </div>
            }

            <div class="payment__note">
              <mat-icon>lock</mat-icon>
              <span>{{ 'booking.widget_notice' | translate }}</span>
            </div>

            @if (paymentDone()) {
              <div class="payment__ok">
                <mat-icon>check_circle</mat-icon>
                <span>{{ 'booking.payment_success' | translate }}</span>
              </div>
            }

            <div class="booking__nav">
              <button mat-stroked-button matStepperPrevious>{{ 'common.back' | translate }}</button>
              <button mat-flat-button class="payment__pay" [disabled]="isPaying()" (click)="pay()">
                @if (isPaying()) {
                  <mat-spinner diameter="20" />
                } @else {
                  {{ 'booking.payment_pay' | translate }}
                }
              </button>
            </div>
          </div>
        </mat-step>
      </mat-stepper>
    </div>
  `,
  styles: `
    .booking {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .booking__head {
      text-align: center;
      margin-bottom: 32px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .booking__field-title {
      font-weight: 600;
      margin: 20px 0 12px;
    }

    .booking__options {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      width: 100%;
    }

    .booking__option {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .booking__option-name {
      font-weight: 600;
    }

    .booking__option-meta {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .booking__options--services mat-radio-card {
      align-self: stretch;
    }

    .booking__nav {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 28px;
    }

    .booking-form {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;

      @media (min-width: 640px) {
        grid-template-columns: 1fr 1fr;
      }
    }

    .booking-form mat-form-field:first-child {
      @media (min-width: 640px) {
        grid-column: 1 / -1;
      }
    }

    .booking-form__register {
      grid-column: 1 / -1;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low, transparent);
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        flex: none;
      }
    }

    .booking-form__register-link {
      font-weight: 600;
      color: var(--mat-sys-primary);
      cursor: pointer;
    }

    .booking-form__habeas {
      grid-column: 1 / -1;
      margin-top: 12px;
      padding: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low, transparent);

      p {
        margin: 8px 0 0 32px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .slot-days {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 8px;
    }

    .slot-days__day {
      min-width: 84px;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 8px;
    }

    .slot-days__day--active {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    .slot-days__weekday {
      text-transform: capitalize;
      font-size: 12px;
      opacity: 0.85;
    }

    .slot-days__date {
      font-weight: 700;
    }

    .slot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
      padding: 4px;
    }

    .slot-grid__slot {
      padding: 6px 4px;
      font-variant-numeric: tabular-nums;
    }

    .slot-grid__slot--active {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    .booking__empty {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: 24px 0;
    }

    .booking__summary {
      margin-top: 28px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      padding: 20px;

      h3 {
        margin: 0 0 12px;
      }
    }

    .booking__summary-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      color: var(--mat-sys-on-surface-variant);

      strong {
        color: var(--mat-sys-on-surface);
        text-align: right;
      }
    }

    .booking__summary-row--total {
      border-top: 1px solid var(--mat-sys-outline-variant);
      margin-top: 8px;
      padding-top: 16px;
      color: var(--mat-sys-on-surface);

      strong {
        font-size: 20px;
      }
    }

    .payment {
      max-width: 520px;
    }

    .payment__amount {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 16px 0;
      font-size: 18px;

      strong {
        font-size: 26px;
      }
    }

    .payment__modes {
      display: grid;
      gap: 10px;
      width: 100%;
      margin-bottom: 16px;
    }

    .payment__mode {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;

      span {
        margin-right: 8px;
      }

      strong {
        color: var(--mat-sys-primary);
      }
    }

    .payment__note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .payment__ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
      font-weight: 600;
      margin-top: 16px;
    }

    .payment__pay {
      margin-left: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);
  private readonly data = inject(PortalDataService);
  private readonly availability = inject(AvailabilityService);
  private readonly booking = inject(BookingService);
  private readonly payments = inject(PaymentSessionService);
  private readonly checkout = inject(WompiCheckoutService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  protected readonly tenant = this.tenants.currentTenant;

  private readonly servicesList = signal<Service[]>([]);
  private readonly professionalsList = signal<Professional[]>([]);
  private readonly daysList = signal<Date[]>([]);
  private readonly slotsList = signal<SlotView[]>([]);
  private readonly selService = signal<Service | null>(null);
  private readonly selProfessional = signal<Professional | null>(null);
  private readonly selDate = signal<Date | null>(null);
  private readonly selSlot = signal<SlotView | null>(null);
  private readonly paying = signal(false);
  private readonly payDone = signal(false);
  private readonly payMode = signal<'advance' | 'full'>('advance');

  protected readonly selectedPaymentMode = this.payMode.asReadonly();

  protected readonly services = this.servicesList.asReadonly();
  protected readonly professionals = this.professionalsList.asReadonly();
  protected readonly days = this.daysList.asReadonly();
  protected readonly slots = this.slotsList.asReadonly();
  protected readonly selectedService = this.selService.asReadonly();
  protected readonly selectedProfessional = this.selProfessional.asReadonly();
  protected readonly selectedDate = this.selDate.asReadonly();
  protected readonly selectedSlot = this.selSlot.asReadonly();
  protected readonly isPaying = this.paying.asReadonly();
  protected readonly paymentDone = this.payDone.asReadonly();

  protected readonly contactForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(7)] }),
    email: new FormControl('', { validators: [Validators.email] }),
    documentId: new FormControl(''),
    habeasData: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  protected readonly authenticated = signal(this.auth.isAuthenticated());

  private readonly platformId = inject(PLATFORM_ID);
  private leftToConfirmation = false;

  protected readonly serviceDone = computed(
    () => this.selService() !== null && this.selProfessional() !== null,
  );
  protected readonly slotDone = computed(() => this.selSlot() !== null);

  protected readonly upfrontPercent = computed(
    () => this.tenant()?.settings.upfrontPercent ?? 30,
  );
  protected readonly upfrontAmount = computed(() => {
    const service = this.selService();
    if (!service) return 0;
    return Math.round((service.price * this.upfrontPercent()) / 100);
  });
  protected readonly fullAmount = computed(() => this.selService()?.price ?? 0);

  ngOnInit(): void {
    const slug = tenantSlugFromSnapshot(this.route.snapshot);
    if (!slug) return;
    this.tenants.resolve(slug).subscribe((tenant) => {
      this.data.services(tenant.tenantId).subscribe((s) => this.servicesList.set(s));

      const preselected = this.route.snapshot.queryParamMap.get('servicio');
      if (preselected) {
        const match = this.servicesList().find((s) => s.id === preselected);
        if (match) this.applyService(match);
      }
    });
  }

  onServiceChange(event: SelectionEvent<string>): void {
    const service = this.servicesList().find((s) => s.id === event.value);
    if (service) this.applyService(service);
  }

  onProfessionalChange(event: SelectionEvent<string>): void {
    const professional = this.professionalsList().find((p) => p.id === event.value);
    this.selProfessional.set(professional ?? null);
    this.resetSchedule();
    if (professional) {
      this.availability
        .availableDays([professional.id])
        .subscribe((d) => this.daysList.set(d));
    }
  }

  onDaySelect(day: Date): void {
    this.selDate.set(day);
    this.selSlot.set(null);
    const professional = this.selProfessional();
    const service = this.selService();
    if (!professional || !service) return;
    this.availability
      .slotsFor(day, professional.id, service.durationMinutes)
      .subscribe((slots) => this.slotsList.set(slots));
  }

  onSlotSelect(slot: SlotView): void {
    this.selSlot.set(slot);
  }

  protected isSelectedSlot(slot: SlotView): boolean {
    return this.selSlot()?.start.getTime() === slot.start.getTime();
  }

  protected hasAvailableSlots(): boolean {
    return this.slots().some((s) => s.available);
  }

  protected weekdayLabel(day: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'short' }).format(day);
  }

  protected dayLabel(day: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short' }).format(day);
  }

  protected fullDateLabel(day: Date): string {
    return new Intl.DateTimeFormat(this.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(day);
  }

  protected slotTimeLabel(time: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(time);
  }

  protected onPaymentMode(event: SelectionEvent<string>): void {
    this.payMode.set(event.value === 'full' ? 'full' : 'advance');
  }

  pay(): void {
    const service = this.selService();
    const professional = this.selProfessional();
    const slot = this.selSlot();
    if (!service || !professional || !slot || this.contactForm.invalid) return;

    this.paying.set(true);
    const tenant = this.tenant();
    if (!tenant) return;

    this.booking
      .create({
        tenantId: tenant.tenantId,
        serviceId: service.id,
        professionalId: professional.id,
        startTime: slot.start,
        clientInfo: {
          name: this.contactForm.controls['name'].value,
          phone: this.contactForm.controls['phone'].value,
          email: this.contactForm.controls['email'].value || undefined,
          documentId: this.contactForm.controls['documentId'].value || undefined,
          habeasDataConsent: true,
          habeasDataConsentAt: new Date().toISOString(),
        },
        source: 'web',
      })
      .subscribe({
        next: (appointment) => this.handlePaySuccess(appointment),
        error: () => {
          this.paying.set(false);
          this.slotConflict();
        },
      });
  }

  private handlePaySuccess(appointment: Appointment): void {
    const tenant = this.tenant();
    if (!tenant) return;
    const intent = this.booking.paymentIntent();
    const mode = this.payMode();
    if (mode === 'advance' || !intent) {
      this.payWith(appointment, intent);
      return;
    }
    this.payments.create(tenant.tenantId, appointment.id, 'full').subscribe({
      next: (session) => this.payWith(appointment, session.intent, session),
      error: () => this.payWith(appointment, intent),
    });
  }

  private payWith(
    appointment: Appointment,
    intent: BookingIntent | null,
    session?: PaymentSessionResult,
  ): void {
    if (!intent) {
      this.paying.set(false);
      this.slotConflict();
      return;
    }
    if (intent.chargeMode === 'hosted' && intent.publicKey && intent.signatureIntegrity) {
      this.openCheckout(appointment, intent);
    } else {
      this.approveDemo(appointment, session);
    }
  }

  private approveDemo(appointment: Appointment, session?: PaymentSessionResult): void {
    this.booking
      .approvePayment(
        appointment,
        session
          ? {
              reference: session.paymentReference,
              amount: session.amount,
              currency: session.currency,
            }
          : undefined,
      )
      .subscribe({
        next: (confirmed) => {
          this.paying.set(false);
          this.payDone.set(true);
          const tenant = this.tenant();
          void this.router.navigate(['/', tenant?.slug, 'confirmacion'], {
            queryParams: { ref: confirmed.id },
          });
        },
        error: () => {
          this.paying.set(false);
          this.snackbar.open('common.error', 'OK', { panelClass: 'app-error' });
        },
      });
  }

  private openCheckout(appointment: Appointment, intent: BookingIntent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const tenant = this.tenant();
    const ref = appointment.id;
    this.paying.set(false);
    this.checkout.open(intent).subscribe({
      next: (result) => this.onWidgetResult(result, tenant?.slug, ref),
      error: () => {
        this.snackbar.open('common.error', 'OK', { panelClass: 'app-error' });
      },
    });
  }

  private onWidgetResult(result: WompiCheckoutResult, slug: string | undefined, ref: string): void {
    const status = result.transaction?.status;
    if (status === 'APPROVED' && !this.leftToConfirmation) {
      this.leftToConfirmation = true;
      this.payDone.set(true);
      void this.router.navigate(['/', slug, 'confirmacion'], { queryParams: { ref } });
    } else if (status) {
      this.snackbar.open('booking.payment_failed_widget', 'OK', { panelClass: 'app-error' });
    }
  }

  private applyService(service: Service): void {
    this.selService.set(service);
    this.selProfessional.set(null);
    this.resetSchedule();
    this.data
      .professionalsForService(this.tenant()?.tenantId ?? '', service.id)
      .subscribe((p) => this.professionalsList.set(p));
  }

  private resetSchedule(): void {
    this.daysList.set([]);
    this.slotsList.set([]);
    this.selDate.set(null);
    this.selSlot.set(null);
  }

  private slotConflict(): void {
    void this.translate
      .get('booking.payment_timeout', { minutes: this.tenant()?.settings.paymentTimeoutMinutes ?? 15 })
      .subscribe((msg) => this.snackbar.open(msg, 'OK', { panelClass: 'app-error' }));
    this.resetSchedule();
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}