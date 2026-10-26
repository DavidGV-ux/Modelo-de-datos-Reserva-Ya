import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/auth/auth.service';
import { BookingService } from '../../services/booking.service';
import { TenantService } from '../../services/tenant.service';
import { PortalDataService } from '../../services/portal-data.service';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-history-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="history">
      <div class="history__head">
        <h1>{{ 'history.title' | translate }}</h1>
        <p>{{ authenticated() ? ('history.subtitle' | translate) : ('history.lookup_subtitle' | translate) }}</p>
      </div>

      @if (!authenticated()) {
        <mat-card class="history__lookup">
          <form [formGroup]="lookupForm" class="history__lookup-form" (ngSubmit)="search()">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_phone' | translate }}</mat-label>
              <input matInput formControlName="phone" autocomplete="tel" placeholder="+57 300 000 0000" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'booking.contact_document' | translate }}</mat-label>
              <input matInput formControlName="documentId" autocomplete="off" />
            </mat-form-field>
            <button mat-flat-button class="history__lookup-submit" [disabled]="lookupForm.invalid">
              {{ 'history.search' | translate }}
            </button>
          </form>
          <p class="history__lookup-note">
            <mat-icon>info</mat-icon>
            <span>{{ 'history.lookup_note' | translate }}</span>
          </p>
        </mat-card>
      }

      @if (appointments(); as appointments) {
        @for (appointment of appointments; track appointment.id) {
          <mat-card class="history__item" [class.history__item--cancelled]="appointment.status === 'cancelled'">
            <div class="history__item-main">
              <h3>{{ appointment.serviceSnapshot.name }}</h3>
              <div class="history__item-meta">
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ dateLabel(appointment.startTime) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ timeLabel(appointment.startTime) }} – {{ timeLabel(appointment.endTime) }}
                </span>
                <span>
                  <mat-icon>person</mat-icon>
                  {{ professionalName(appointment.professionalId) }}
                </span>
              </div>
            </div>

            <div class="history__item-side">
              <span class="history__status" [class.history__status--cancelled]="appointment.status === 'cancelled'">
                {{ 'history.status_' + appointment.status | translate }}
              </span>
              <strong>{{ appointment.serviceSnapshot.price | appMoney: tenant()?.currency }}</strong>
            </div>
          </mat-card>
        } @empty {
          <mat-card class="history__empty">
            <mat-icon>event_available</mat-icon>
            <p>{{ 'history.empty' | translate }}</p>
          </mat-card>
        }
      }

      <p class="history__note">{{ 'history.note' | translate }}</p>
    </div>
  `,
  styles: `
    .history {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .history__head {
      text-align: center;
      margin-bottom: 28px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .history__lookup {
      padding: 20px;
      margin-bottom: 24px;
      background: var(--mat-sys-surface-container);
    }

    .history__lookup-form {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: baseline;
    }

    .history__lookup-form mat-form-field {
      flex: 1;
      min-width: 200px;
    }

    .history__lookup-submit {
      align-self: center;
    }

    .history__lookup-note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 12px 0 0;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .history__lookup-note mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .history__item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px;
      margin-bottom: 12px;
    }

    .history__item--cancelled {
      opacity: 0.6;
    }

    .history__item-main h3 {
      margin: 0 0 8px;
    }

    .history__item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .history__item-meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .history__item-meta mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .history__item-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .history__item-side strong {
      font-size: 18px;
    }

    .history__status {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      text-transform: uppercase;
    }

    .history__status--cancelled {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .history__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .history__empty mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .history__note {
      text-align: center;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage implements OnInit {
  private readonly tenants = inject(TenantService);
  private readonly booking = inject(BookingService);
  private readonly data = inject(PortalDataService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  protected readonly tenant = this.tenants.currentTenant;
  protected readonly authenticated = signal(this.auth.isAuthenticated());

  protected readonly lookupForm = new FormGroup({
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(7)] }),
    documentId: new FormControl('', { nonNullable: false }),
  });

  private readonly appts = signal<Appointment[]>([]);
  protected readonly appointments = this.appts.asReadonly();
  private readonly professionals = signal(new Map<string, string>());

  ngOnInit(): void {
    if (this.authenticated()) {
      this.booking.history().subscribe((list) => this.appts.set(list));
    }
    const tenantId = this.tenant()?.tenantId ?? '';
    this.data.professionals(tenantId).subscribe((pros) => {
      this.professionals.set(new Map(pros.map((p) => [p.id, p.name])));
    });
  }

  protected search(): void {
    const phone = this.lookupForm.controls['phone'].value;
    const documentId = this.lookupForm.controls['documentId'].value || undefined;
    if (!phone) return;
    this.booking.history(phone, documentId).subscribe((list) => this.appts.set(list));
  }

  protected professionalName(id: string): string {
    return this.professionals().get(id) ?? '—';
  }

  protected dateLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected timeLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}