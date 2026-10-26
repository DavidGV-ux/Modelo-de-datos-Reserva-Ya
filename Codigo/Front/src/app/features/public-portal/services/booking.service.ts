import { Injectable, inject, signal } from '@angular/core';
import { map, Observable, of, throwError, delay } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import {
  BackendAppointment,
  BookingIntent,
  BookingResult,
  mapAppointment,
} from '../../../core/http/api-mappers';
import { AvailabilityService } from './availability.service';
import { TenantService } from './tenant.service';
import { MOCK_APPOINTMENTS } from '../../../shared/mocks/dashboard.mock';
import { MOCK_PROFESSIONALS, MOCK_SERVICES, MOCK_TENANT } from '../../../shared/mocks/tenant.mock';
import {
  Appointment,
  AppointmentSource,
  ClientInfo,
  Service,
} from '../../../shared/models/domain.model';

export interface BookingRequest {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  startTime: Date;
  clientInfo: ClientInfo;
  source?: AppointmentSource;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly api = inject(ApiService);
  private readonly availability = inject(AvailabilityService);
  private readonly tenants = inject(TenantService);

  private readonly sessionAppointments = signal<Appointment[]>([]);
  private readonly counter = signal(0);

  readonly appointments = this.sessionAppointments.asReadonly();

  private lastIntent: BookingIntent | null = null;

  paymentIntent(): BookingIntent | null {
    return this.lastIntent;
  }

  create(request: BookingRequest): Observable<Appointment> {
    if (!environment.useMockBackend) {
      return this.api
        .post<BookingResult>(`/public/${request.tenantId}/appointments`, {
          serviceId: request.serviceId,
          professionalId: request.professionalId,
          startTime: new Date(request.startTime).toISOString(),
          clientInfo: {
            name: request.clientInfo.name,
            phone: request.clientInfo.phone,
            email: request.clientInfo.email,
            documentId: request.clientInfo.documentId,
            habeasDataConsent: true,
            habeasDataConsentAt: new Date().toISOString(),
          },
          source: request.source ?? 'web',
        })
        .pipe(
          map((result) => {
            this.lastIntent = {
              advanceAmount: result.intent.advanceAmount,
              currency: result.intent.currency,
              paymentReference:
                result.intent.paymentReference ?? result.appointment.paymentReference ?? '',
              chargeMode: result.intent.chargeMode,
              publicKey: result.intent.publicKey,
              amountInCents: result.intent.amountInCents,
              signatureIntegrity: result.intent.signatureIntegrity,
            };
            return mapAppointment(result.appointment);
          }),
        );
    }

    const service = this.serviceById(request.serviceId);
    const start = new Date(request.startTime);
    const end = new Date(start.getTime() + service.durationMinutes * 60000);

    if (this.availability.hasOverlap(request.professionalId, start, end)) {
      return throwError(
        () => new Error('AvailabilityConflict: the requested slot is no longer available'),
      );
    }

    const index = this.counter() + 1;
    this.counter.set(index);
    const reference = `RSV-${Date.now().toString(36).toUpperCase()}${index}`;
    const now = new Date();

    const appointment: Appointment = {
      id: `appt_session_${index}`,
      tenantId: request.tenantId,
      professionalId: request.professionalId,
      serviceId: request.serviceId,
      serviceSnapshot: {
        serviceId: service.id,
        name: service.name,
        price: service.price,
        currency: MOCK_TENANT.currency,
        durationMinutes: service.durationMinutes,
      },
      commissionRateSnapshot: 0.05,
      planIdSnapshot: MOCK_TENANT.planId,
      idempotencyKey: `${reference}-${now.getTime()}`,
      source: request.source ?? 'web',
      clientInfo: request.clientInfo,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      needsReassignment: false,
      version: 1,
    };

    this.availability.reserve(request.professionalId, start, end);
    this.sessionAppointments.update((list) => [...list, appointment]);
    return of(appointment).pipe(delay(400));
  }

  approvePayment(
    appointment: Appointment,
    overrides?: { reference?: string; amount?: number; currency?: string },
  ): Observable<Appointment> {
    if (!environment.useMockBackend) {
      const intent = this.lastIntent;
      const reference = overrides?.reference ?? appointment.paymentReference ?? intent?.paymentReference;
      if (!reference || !intent) {
        return throwError(() => new Error('no payment intent available'));
      }
      return this.api
        .post<{ handled: boolean; appointment?: BackendAppointment }>(
          '/webhooks/demo/payments/approve',
          {
            reference,
            amount: overrides?.amount ?? intent.advanceAmount,
            currency: overrides?.currency ?? intent.currency,
            tenantId: appointment.tenantId,
          },
        )
        .pipe(
          map((result) => {
            if (result.appointment) {
              return mapAppointment(result.appointment);
            }
            return {
              ...appointment,
              status: 'confirmed' as const,
              paymentStatus: 'approved' as const,
            };
          }),
        );
    }

    const confirmed: Appointment = {
      ...appointment,
      status: 'confirmed',
      paymentStatus: 'approved',
      paymentReference: appointment.paymentReference ?? `PAY-REF-${appointment.id}`,
    };

    this.sessionAppointments.update((list) =>
      list.map((a) => (a.id === appointment.id ? confirmed : a)),
    );

    return of(confirmed).pipe(delay(600));
  }

  cancel(appointment: Appointment, by: 'client' | 'business' | 'professional'): Observable<Appointment> {
    if (!environment.useMockBackend) {
      return this.api
        .post<BackendAppointment>(`/public/${appointment.tenantId}/appointments/${appointment.id}/cancel`, {})
        .pipe(map(mapAppointment));
    }

    const notified = this.sessionAppointments().some((a) => a.id === appointment.id);
    const cancelled: Appointment = {
      ...appointment,
      status: 'cancelled',
      cancellation: {
        by,
        refundAmount: 0,
        processingFee: 0,
        at: new Date().toISOString(),
      },
    };
    if (notified) {
      this.availability.release(
        appointment.professionalId,
        new Date(appointment.startTime),
        new Date(appointment.endTime),
      );
      this.sessionAppointments.update((list) =>
        list.map((a) => (a.id === appointment.id ? cancelled : a)),
      );
    }
    return of(cancelled).pipe(delay(200));
  }

  history(clientPhone?: string, clientDocument?: string): Observable<Appointment[]> {
    if (!environment.useMockBackend) {
      const tenantId = this.tenants.currentTenant()?.tenantId;
      if (!tenantId) return of([]);
      const params = new URLSearchParams();
      if (clientPhone) params.set('phone', clientPhone);
      if (clientDocument) params.set('documentId', clientDocument);
      const qs = params.toString();
      return this.api
        .get<BackendAppointment[]>(`/public/${tenantId}/appointments/history${qs ? `?${qs}` : ''}`)
        .pipe(map((list) => list.map(mapAppointment)));
    }

    const all = [...this.sessionAppointments(), ...MOCK_APPOINTMENTS];
    const filtered = clientPhone
      ? all.filter((a) => a.clientInfo.phone === clientPhone)
      : all;
    return of(
      filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    );
  }

  getById(tenantId: string, appointmentId: string): Observable<Appointment> {
    if (!environment.useMockBackend) {
      return this.api
        .get<BackendAppointment>(`/public/${tenantId}/appointments/${appointmentId}`)
        .pipe(map(mapAppointment));
    }
    const all = [...this.sessionAppointments(), ...MOCK_APPOINTMENTS];
    const match = all.find((a) => a.id === appointmentId);
    return match ? of(match) : throwError(() => new Error('appointment not found'));
  }

  serviceById(id: string): Service {
    const service = MOCK_SERVICES.find((s) => s.id === id);
    if (!service) {
      throw new Error(`ServiceNotFound: ${id}`);
    }
    return service;
  }
}