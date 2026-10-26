import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-my-schedule',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatListModule,
    MatButtonModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="schedule">
      <div class="schedule__head">
        <h1>{{ 'dashboard.schedule' | translate }}</h1>
        @if (businessName(); as name) {
          <p>{{ name }}</p>
        }
      </div>

      @if (notProfessional()) {
        <mat-card class="schedule__panel">
          <div class="schedule__empty-state">
            <mat-icon>work_off</mat-icon>
            <p>{{ 'dashboard.not_professional_here' | translate }}</p>
          </div>
        </mat-card>
      } @else {
        <div class="schedule__days">
        @for (day of days(); track day.getTime()) {
          <button
            mat-stroked-button
            class="schedule__day"
            [class.schedule__day--active]="day.getTime() === selectedDay()?.getTime()"
            (click)="selectDay(day)"
          >
            {{ weekday(day) }}
            <span class="schedule__day-date">{{ dayNumber(day) }}</span>
          </button>
        }
        </div>

        <mat-card class="schedule__panel">
          <mat-list>
            @for (appointment of dayAppointments(); track appointment.id) {
              <mat-list-item class="schedule__item">
                <mat-icon matListItemIcon>event</mat-icon>
                <span matListItemTitle>{{ time(appointment.startTime) }} – {{ time(appointment.endTime) }}</span>
                <span matListItemLine>
                  {{ appointment.clientInfo.name }} · {{ appointment.serviceSnapshot.name }}
                  · {{ appointment.serviceSnapshot.price | appMoney }}
                </span>
                <span matListItemMeta>
                  <button mat-stroked-button (click)="toggleStatus(appointment)">
                    {{ appointment.status === 'completed' ? 'Completed' : 'Done' }}
                  </button>
                </span>
              </mat-list-item>
            } @empty {
              <mat-list-item class="schedule__empty">
                <span matListItemTitle>{{ 'dashboard.empty_day' | translate }}</span>
              </mat-list-item>
            }
          </mat-list>
        </mat-card>

        <div class="schedule__actions">
          <mat-chip-set>
            <mat-chip>
              <mat-icon chipIcon>toggle_on</mat-icon>
              {{ 'dashboard.available' | translate }}
            </mat-chip>
          </mat-chip-set>
          <button mat-stroked-button>{{ 'dashboard.configure_availability' | translate }}</button>
        </div>
      }
    </div>
  `,
  styles: `
    .schedule {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .schedule__head {
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .schedule__days {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }

    .schedule__day {
      min-width: 72px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .schedule__day--active {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }

    .schedule__day-date {
      font-weight: 700;
    }

    .schedule__panel {
      padding: 8px;
    }

    .schedule__empty {
      color: var(--mat-sys-on-surface-variant);
    }

    .schedule__empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 48px 20px;
      color: var(--mat-sys-on-surface-variant);
      text-align: center;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }
    }

    .schedule__actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySchedulePage implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly dashboard = inject(DashboardService);

  private readonly business = signal<string | null>(null);
  private readonly notProfessionalFlag = signal(false);
  private readonly tenantContext = signal<string | null>(null);
  private readonly daysList = signal<Date[]>([]);
  private readonly selected = signal<Date | null>(null);
  private readonly dayAppts = signal<Appointment[]>([]);

  protected readonly businessName = this.business.asReadonly();
  protected readonly notProfessional = this.notProfessionalFlag.asReadonly();
  protected readonly days = this.daysList.asReadonly();
  protected readonly selectedDay = this.selected.asReadonly();
  protected readonly dayAppointments = this.dayAppts.asReadonly();

  ngOnInit(): void {
    this.dashboard.professionalContext().subscribe((membership) => {
      this.tenantContext.set(membership?.tenantId ?? null);
      this.business.set(membership?.name ?? null);
      if (!membership) {
        this.notProfessionalFlag.set(true);
        return;
      }
      this.notProfessionalFlag.set(false);
      const days: Date[] = [];
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
      }
      this.daysList.set(days);
      const today = days.find((d) => d.getDate() === now.getDate()) ?? days[0];
      this.selected.set(today);
      this.reload(today);
    });
  }

  selectDay(day: Date): void {
    this.selected.set(day);
    this.reload(day);
  }

  private reload(day: Date): void {
    const start = day.toISOString();
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    this.dayAppts.set([]);
    this.dashboard
      .professionalAgenda(this.tenantContext() ?? '', start, end.toISOString())
      .subscribe({
        next: (agenda) => {
          this.dayAppts.set(
            agenda.appointments
              .filter((a) => a.startTime >= start && a.startTime < end.toISOString())
              .sort((a, b) => a.startTime.localeCompare(b.startTime)),
          );
        },
        error: () => {
          this.notProfessionalFlag.set(true);
          this.dayAppts.set([]);
        },
      });
  }

  protected toggleStatus(appointment: Appointment): void {
    this.dayAppts.update((list) =>
      list.map((a) =>
        a.id === appointment.id ? { ...a, status: appointment.status === 'confirmed' ? 'completed' : 'confirmed' } : a,
      ),
    );
  }

  protected weekday(day: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { weekday: 'short' }).format(day);
  }

  protected dayNumber(day: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { day: 'numeric' }).format(day);
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}