import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Currency } from '../models/domain.model';

@Pipe({ name: 'appCurrency', standalone: true })
export class CurrencySymbolPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(_value: unknown, currency: Currency = 'COP'): string {
    const locale = this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency')?.value ?? currency;
    return symbol === currency ? currency : symbol;
  }
}