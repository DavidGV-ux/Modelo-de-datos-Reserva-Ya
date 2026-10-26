import { Pipe, PipeTransform, Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Currency } from '../models/domain.model';

@Pipe({ name: 'appMoney', standalone: true })
@Injectable({ providedIn: 'root' })
export class MoneyPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: number | null | undefined, currency: Currency | null | undefined = 'COP'): string {
    if (value == null) return '—';
    const code = currency ?? 'COP';
    const locale = this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  }
}