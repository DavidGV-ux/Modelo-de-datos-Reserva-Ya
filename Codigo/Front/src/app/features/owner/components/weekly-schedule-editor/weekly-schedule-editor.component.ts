import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { WeekDay, WeeklySchedule } from '../../../../shared/models/domain.model';

export const WEEK_DAYS: WeekDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function emptyWeeklySchedule(): WeeklySchedule {
  const schedule = {} as WeeklySchedule;
  for (const day of WEEK_DAYS) schedule[day] = [];
  return schedule;
}

export function defaultWeeklySchedule(): WeeklySchedule {
  const schedule = emptyWeeklySchedule();
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as WeekDay[]) {
    schedule[day] = [{ start: '09:00', end: '18:00' }];
  }
  return schedule;
}

function toMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function scheduleRangeValidator(group: AbstractControl): ValidationErrors | null {
  const enabled = group.get('enabled')?.value;
  if (!enabled) return null;
  const start = group.get('start')?.value;
  const end = group.get('end')?.value;
  if (!start || !end) return null;
  if (toMinutes(start) >= toMinutes(end)) return { range: true };
  return null;
}

function timePattern(): ReturnType<typeof Validators.pattern> {
  return Validators.pattern(/^\d{1,2}:\d{2}$/);
}

interface DayForm {
  enabled: FormControl<boolean>;
  start: FormControl<string>;
  end: FormControl<string>;
}

@Component({
  selector: 'app-weekly-schedule-editor',
  imports: [ReactiveFormsModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <form [formGroup]="form" class="wse">
      @for (day of days; track day) {
        <div class="wse__row" [formGroupName]="day">
          <mat-checkbox formControlName="enabled" color="primary">
            {{ 'owner.day_' + day | translate }}
          </mat-checkbox>

          <div class="wse__times">
            <mat-form-field appearance="outline" class="wse__time">
              <mat-label>{{ 'owner.schedule_start' | translate }}</mat-label>
              <input matInput type="time" formControlName="start" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="wse__time">
              <mat-label>{{ 'owner.schedule_end' | translate }}</mat-label>
              <input matInput type="time" formControlName="end" />
            </mat-form-field>
          </div>

          @if (invalidDay(day)) {
            <p class="wse__error">{{ 'owner.schedule_invalid' | translate }}</p>
          }
        </div>
      }
    </form>
  `,
  styles: `
    .wse {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 360px;
      padding-top: 8px;
    }

    .wse__row {
      display: grid;
      grid-template-columns: 140px 1fr;
      align-items: center;
      gap: 4px 16px;
      padding: 6px 0;
    }

    .wse__times {
      display: flex;
      gap: 12px;
    }

    .wse__time {
      width: 110px;
    }

    .wse__error {
      grid-column: 2;
      margin: 0;
      font-size: 12px;
      color: var(--mat-sys-error);
    }

    @media (max-width: 520px) {
      .wse {
        min-width: 0;
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeeklyScheduleEditor implements OnChanges {
  @Input() schedule: WeeklySchedule | null | undefined;

  @Output() readonly valueChange = new EventEmitter<WeeklySchedule>();
  @Output() readonly validChange = new EventEmitter<boolean>();

  protected readonly days = WEEK_DAYS;

  protected readonly form = new FormGroup<Record<WeekDay, FormGroup<DayForm>>>(
    Object.fromEntries(WEEK_DAYS.map((day) => [day, this.createDay()])) as Record<
      WeekDay,
      FormGroup<DayForm>
    >,
  );

  ngOnChanges(): void {
    const current = this.currentSchedule();
    for (const day of WEEK_DAYS) {
      const group = this.form.controls[day];
      const interval = current[day][0];
      group.controls['enabled'].setValue(Boolean(interval), { emitEvent: false });
      group.controls['start'].setValue(interval?.start ?? '09:00', { emitEvent: false });
      group.controls['end'].setValue(interval?.end ?? '18:00', { emitEvent: false });
    }
    this.emit();
  }

  protected invalidDay(day: WeekDay): boolean {
    return this.form.controls[day].invalid;
  }

  invalid(): boolean {
    return this.form.invalid;
  }

  value(): WeeklySchedule {
    const schedule = emptyWeeklySchedule();
    for (const day of WEEK_DAYS) {
      const group = this.form.controls[day];
      const enabled = group.controls['enabled'].value;
      const start = group.controls['start'].value;
      const end = group.controls['end'].value;
      schedule[day] = enabled && start && end ? [{ start, end }] : [];
    }
    return schedule;
  }

  private createDay(): FormGroup<DayForm> {
    const group = new FormGroup<DayForm>({
      enabled: new FormControl<boolean>(true, { nonNullable: true }),
      start: new FormControl<string>('09:00', {
        nonNullable: true,
        validators: [Validators.required, timePattern()],
      }),
      end: new FormControl<string>('18:00', {
        nonNullable: true,
        validators: [Validators.required, timePattern()],
      }),
    });
    group.addValidators(scheduleRangeValidator);
    group.valueChanges.subscribe(() => this.emit());
    return group;
  }

  private currentSchedule(): WeeklySchedule {
    const given = this.schedule;
    if (given && WEEK_DAYS.some((day) => (given[day] ?? []).length)) {
      return {
        monday: given.monday ?? [],
        tuesday: given.tuesday ?? [],
        wednesday: given.wednesday ?? [],
        thursday: given.thursday ?? [],
        friday: given.friday ?? [],
        saturday: given.saturday ?? [],
        sunday: given.sunday ?? [],
      };
    }
    return defaultWeeklySchedule();
  }

  private emit(): void {
    this.valueChange.emit(this.value());
    this.validChange.emit(!this.form.invalid);
  }
}