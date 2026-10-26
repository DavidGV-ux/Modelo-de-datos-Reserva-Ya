import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    <div class="not-found">
      <mat-icon class="not-found__icon">search_off</mat-icon>
      <h1>{{ 'common.notFound.title' | translate }}</h1>
      <p>{{ 'common.notFound.message' | translate }}</p>
      <a mat-flat-button routerLink="/">{{ 'common.notFound.goHome' | translate }}</a>
    </div>
  `,
  styles: `
    .not-found {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
      padding: 24px;
    }

    .not-found__icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--mat-sys-outline);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}