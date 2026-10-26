import { Provider } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { DEFAULT_LANGUAGE } from './language.service';
import { environment } from '../config/environment';

export function provideI18n(): Provider[] {
  return [
    provideTranslateService({
      lang: DEFAULT_LANGUAGE,
      fallbackLang: DEFAULT_LANGUAGE,
      loader: provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: `.json?v=${environment.appVersion}`,
      }),
    }),
  ];
}