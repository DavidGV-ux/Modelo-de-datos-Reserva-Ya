import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { UpperCasePipe } from '@angular/common';
import { LanguageService, SUPPORTED_LANGUAGES } from '../../../core/i18n/language.service';

@Component({
  selector: 'app-locale-switcher',
  imports: [MatButtonModule, MatMenuModule, MatIconModule, UpperCasePipe],
  template: `
    <button mat-button [matMenuTriggerFor]="menu" class="locale-switcher" aria-label="Idioma / Language">
      <mat-icon class="locale-switcher__globe">language</mat-icon>
      <span class="locale-switcher__code">{{ currentLanguage() | uppercase }}</span>
      <mat-icon class="locale-switcher__caret">arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @for (lang of languages; track lang) {
        <button mat-menu-item (click)="setLanguage(lang)" [class.locale-switcher__active]="currentLanguage() === lang">
          <span>
            <mat-icon class="locale-switcher__check" [style.visibility]="currentLanguage() === lang ? 'visible' : 'hidden'">
              check
            </mat-icon>
            {{ lang | uppercase }}
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .locale-switcher__globe {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .locale-switcher__code {
      margin-left: 6px;
      font-weight: 600;
    }

    .locale-switcher__caret {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .locale-switcher__check {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 6px;
      vertical-align: -4px;
    }

    .locale-switcher__active {
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocaleSwitcher {
  private readonly language = inject(LanguageService);

  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly currentLanguage = this.language.currentLanguage;

  setLanguage(lang: (typeof SUPPORTED_LANGUAGES)[number]): void {
    this.language.setLanguage(lang);
  }
}