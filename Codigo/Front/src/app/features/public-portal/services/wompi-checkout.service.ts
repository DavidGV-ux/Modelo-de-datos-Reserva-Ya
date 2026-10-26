import { Injectable, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { BookingIntent } from '../../../core/http/api-mappers';

export interface WompiCheckoutParams {
  currency: string;
  amountInCents: number;
  reference: string;
  publicKey: string;
  signature: { integrity: string };
}

export interface WompiCheckoutResult {
  transaction?: { status?: string };
}

type WompiWidget = new (
  params: WompiCheckoutParams,
) => { open: (onResult: (result: WompiCheckoutResult) => void) => void };

@Injectable({ providedIn: 'root' })
export class WompiCheckoutService {
  private readonly platformId = inject(PLATFORM_ID);

  open(intent: BookingIntent): Observable<WompiCheckoutResult> {
    if (!isPlatformBrowser(this.platformId)) {
      return throwError(() => new Error('widget can only run in the browser'));
    }
    if (intent.chargeMode !== 'hosted' || !intent.publicKey || !intent.signatureIntegrity) {
      return throwError(() => new Error('charge mode is not hosted'));
    }
    const params: WompiCheckoutParams = {
      currency: intent.currency,
      amountInCents: intent.amountInCents ?? 0,
      reference: intent.paymentReference,
      publicKey: intent.publicKey,
      signature: { integrity: intent.signatureIntegrity },
    };
    return this.ensureScript().pipe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (source: Observable<void>) =>
        new Observable<WompiCheckoutResult>((subscriber) => {
          source.subscribe({
            next: () => {
              const ctor = (window as unknown as { WidgetCheckout?: WompiWidget }).WidgetCheckout;
              if (!ctor) {
                subscriber.error(new Error('widget constructor unavailable'));
                return;
              }
              const widget = new ctor(params);
              widget.open((result) => {
                subscriber.next(result);
                subscriber.complete();
              });
            },
            error: (err) => subscriber.error(err),
          });
        }),
    );
  }

  private ensureScript(): Observable<void> {
    const existing = (typeof document !== 'undefined') &&
      document.querySelector('script[data-wompi-checkout]');
    const w = (typeof window !== 'undefined'
      ? (window as unknown as { WidgetCheckout?: unknown }).WidgetCheckout
      : undefined);
    if (existing || w) return of(undefined);
    return new Observable<void>((subscriber) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.wompi.co/widget.js';
      script.setAttribute('data-wompi-checkout', '');
      script.onload = () => {
        subscriber.next();
        subscriber.complete();
      };
      script.onerror = () => subscriber.error(new Error('wompi checkout failed to load'));
      document.head.appendChild(script);
    });
  }
}