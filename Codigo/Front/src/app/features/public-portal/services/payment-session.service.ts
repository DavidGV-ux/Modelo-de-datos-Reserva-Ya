import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { BookingIntent } from '../../../core/http/api-mappers';
import { Currency } from '../../../shared/models/domain.model';

export type PaymentMode = 'advance' | 'full';

export interface PaymentSessionResult {
  token: string;
  url: string;
  expiresAt: string;
  mode: PaymentMode;
  amount: number;
  advanceAmount: number;
  fullAmount: number;
  currency: Currency;
  paymentReference: string;
  appointmentId: string;
  tenantId: string;
  intent: BookingIntent;
}

@Injectable({ providedIn: 'root' })
export class PaymentSessionService {
  private readonly api = inject(ApiService);

  create(
    tenantId: string,
    appointmentId: string,
    mode: PaymentMode,
  ): Observable<PaymentSessionResult> {
    return this.api.post<PaymentSessionResult>(
      `/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(appointmentId)}/payment-session`,
      { mode },
    );
  }

  resolve(tenantId: string, appointmentId: string, session: string): Observable<PaymentSessionResult> {
    return this.api.post<PaymentSessionResult>(
      `/public/${encodeURIComponent(tenantId)}/appointments/${encodeURIComponent(appointmentId)}/payment-session`,
      { session },
    );
  }
}