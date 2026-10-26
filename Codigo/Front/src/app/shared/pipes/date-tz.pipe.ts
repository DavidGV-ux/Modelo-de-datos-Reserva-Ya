import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageCode } from '../models/domain.model';

export interface TimeZoneFormatOptions {
  timeZone?: string;
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'long' | 'medium' | 'short';
}

@Pipe({ name: 'appDateTz', standalone: true })
export class DateTzPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: string | Date | null | undefined, options: TimeZoneFormatOptions = {}): string {
    if (!value) return '';
    const locale = this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
    const fmt = new Intl.DateTimeFormat(locale, {
      timeZone: options.timeZone,
      dateStyle: options.dateStyle ?? 'medium',
    });
    return fmt.format(new Date(value));
  }
}