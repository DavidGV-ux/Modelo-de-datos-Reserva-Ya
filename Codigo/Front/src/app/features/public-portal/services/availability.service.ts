import { Injectable, inject, signal } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import {
  MOCK_PROFESSIONALS,
  MOCK_WEEK_SCHEDULE,
  MOCK_SCHEDULE_WINDOW_DAYS,
} from '../../../shared/mocks/tenant.mock';
import { Professional } from '../../../shared/models/domain.model';
import { TenantService } from './tenant.service';

export interface SlotView {
  start: Date;
  end: Date;
  available: boolean;
  blocked: boolean;
  reason?: 'block' | 'booked' | 'past' | 'gap';
}

export interface OccupancyRange {
  professionalId: string;
  start: number;
  end: number;
}

interface BackendSlot {
  start: string;
  end: string;
  available: boolean;
  blocked: boolean;
  reason?: SlotView['reason'];
}

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private readonly SLOT_MINUTES = 15;
  private readonly api = inject(ApiService);
  private readonly tenants = inject(TenantService);

  private readonly occupancy = signal<OccupancyRange[]>([]);

  professionalsForService(serviceId: string): Professional[] {
    return MOCK_PROFESSIONALS.filter((p) => p.active && p.serviceIds.includes(serviceId));
  }

  availableDays(professionalIds: string[]): Observable<Date[]> {
    if (!environment.useMockBackend) {
      const tenantId = this.tenants.currentTenant()?.tenantId;
      if (!tenantId || professionalIds.length === 0) return of([]);
      return this.api
        .get<string[]>(
          `/public/${tenantId}/availability/days?professionalIds=${professionalIds.join(',')}&window=${MOCK_SCHEDULE_WINDOW_DAYS}`,
        )
        .pipe(map((days) => days.map((stamp) => dateFromStamp(stamp))));
    }
    return this.mockAvailableDays(professionalIds);
  }

  slotsFor(day: Date, professionalId: string, durationMinutes: number): Observable<SlotView[]> {
    if (!environment.useMockBackend) {
      const tenantId = this.tenants.currentTenant()?.tenantId;
      if (!tenantId) return of([]);
      const stamp = stampFromDate(day);
      return this.api
        .get<BackendSlot[]>(
          `/public/${tenantId}/availability?professionalId=${encodeURIComponent(professionalId)}&date=${stamp}&durationMinutes=${durationMinutes}`,
        )
        .pipe(map((slots) => slots.map((s) => ({ ...s, start: new Date(s.start), end: new Date(s.end) }))));
    }
    return this.mockSlotsFor(day, professionalId, durationMinutes);
  }

  reserve(professionalId: string, start: Date, end: Date): void {
    this.occupancy.update((ranges) => [
      ...ranges,
      { professionalId, start: start.getTime(), end: end.getTime() },
    ]);
  }

  release(professionalId: string, start: Date, end: Date): void {
    const startMs = start.getTime();
    const endMs = end.getTime();
    this.occupancy.update((ranges) =>
      ranges.filter(
        (r) =>
          !(
            r.professionalId === professionalId &&
            r.start === startMs &&
            r.end === endMs
          ),
      ),
    );
  }

  hasOverlap(professionalId: string, start: Date, end: Date): boolean {
    const startMs = start.getTime();
    const endMs = end.getTime();
    return this.occupancy().some(
      (r) => r.professionalId === professionalId && r.start < endMs && r.end > startMs,
    );
  }

  private mockAvailableDays(professionalIds: string[]): Observable<Date[]> {
    const today = startOfToday();
    const days: Date[] = [];

    for (let i = 1; i <= MOCK_SCHEDULE_WINDOW_DAYS; i++) {
      const day = new Date(today.getTime() + i * 86400000);
      if (this.professionalsWorking(professionalIds, day)) {
        days.push(day);
      }
    }
    return of(days);
  }

  private mockSlotsFor(day: Date, professionalId: string, durationMinutes: number): Observable<SlotView[]> {
    const schedule = MOCK_WEEK_SCHEDULE.find((s) => s.dayOfWeek === day.getDay());
    if (!schedule) {
      return of([]);
    }

    const [sh, sm] = schedule.start.split(':').map(Number);
    const [eh, em] = schedule.end.split(':').map(Number);
    const shiftStart = this.at(day, sh, sm);
    const shiftEnd = this.at(day, eh, em);

    const slots: SlotView[] = [];
    for (
      let t = shiftStart.getTime();
      t + this.SLOT_MINUTES * 60000 <= shiftEnd.getTime();
      t += this.SLOT_MINUTES * 60000
    ) {
      const slotEnd = t + this.SLOT_MINUTES * 60000;
      const reason: SlotView['reason'] | undefined = this.slotReason(
        professionalId,
        day,
        t,
        slotEnd,
      );
      const fitsDuration =
        !reason && this.canFitDuration(professionalId, t, durationMinutes);

      slots.push({
        start: new Date(t),
        end: new Date(slotEnd),
        blocked: reason === 'block',
        available: !reason && fitsDuration,
        reason: reason ?? (fitsDuration ? undefined : 'booked'),
      });
    }

    return of(slots);
  }

  private slotReason(
    professionalId: string,
    day: Date,
    slotStart: number,
    slotEnd: number,
  ): SlotView['reason'] | undefined {
    if (slotStart <= Date.now()) return 'past';

    if (professionalId === 'prof_002' && this.inBlockedWindow(day, slotStart)) {
      return 'block';
    }

    if (this.hasOverlap(professionalId, new Date(slotStart), new Date(slotEnd))) {
      return 'booked';
    }

    if (slotStart < nowAtMidnight(day)) return 'past';
    return undefined;
  }

  private canFitDuration(professionalId: string, slotStart: number, durationMinutes: number): boolean {
    const end = slotStart + durationMinutes * 60000;
    for (let t = slotStart; t < end; t += this.SLOT_MINUTES * 60000) {
      if (this.hasOverlap(professionalId, new Date(t), new Date(t + this.SLOT_MINUTES * 60000))) {
        return false;
      }
    }
    if (this.isGapSlot(professionalId, slotStart)) {
      return false;
    }
    return true;
  }

  private inBlockedWindow(day: Date, slotStart: number): boolean {
    const diffDays = Math.round((day.getTime() - startOfToday().getTime()) / 86400000);
    if (diffDays !== 2) return false;
    const hour = new Date(slotStart).getHours() + new Date(slotStart).getMinutes() / 60;
    return hour >= 12 && hour < 14;
  }

  private isGapSlot(_professionalId: string, slotStart: number): boolean {
    const minutes = slotStart / 60000;
    const pseudo = Math.abs(((minutes * 2654435761) % 100) / 100);
    return pseudo < 0.1;
  }

  private professionalsWorking(professionalIds: string[], day: Date): boolean {
    return professionalIds.some((pid) => MOCK_WEEK_SCHEDULE.some((s) => s.dayOfWeek === day.getDay()));
  }

  private at(day: Date, hours: number, minutes: number): Date {
    const d = new Date(day);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function nowAtMidnight(day: Date): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function stampFromDate(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromStamp(stamp: string): Date {
  const [y, m, d] = stamp.split('-').map(Number);
  const local = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return Number.isNaN(local.getTime()) ? new Date() : local;
}