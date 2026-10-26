import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'es';

const STORAGE_KEY = 'ry_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly current = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  readonly currentLanguage = this.current.asReadonly();

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.use(this.resolveInitial());

    this.translate.onLangChange.subscribe(({ lang }) => {
      this.current.set(lang as SupportedLanguage);
    });
  }

  setLanguage(lang: SupportedLanguage): void {
    if (this.browser) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
    this.translate.use(lang);
  }

  private resolveInitial(): SupportedLanguage {
    if (this.browser) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
        return saved as SupportedLanguage;
      }
      return this.browserLanguage();
    }
    return DEFAULT_LANGUAGE;
  }

  private browserLanguage(): SupportedLanguage {
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'es';
    return nav.toLowerCase().startsWith('en') ? 'en' : 'es';
  }
}