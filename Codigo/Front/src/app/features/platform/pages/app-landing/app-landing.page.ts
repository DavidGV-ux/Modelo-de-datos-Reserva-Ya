import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../../core/auth/auth.service';
import { USER_ROLES } from '../../../../core/auth/roles';

@Component({
  selector: 'app-app-landing',
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="app-landing">
      <mat-progress-spinner mode="indeterminate" diameter="40" />
    </div>
  `,
  styles: `
    .app-landing {
      min-height: 60vh;
      display: grid;
      place-items: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLandingPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    void this.redirect();
  }

  private async redirect(): Promise<void> {
    await this.auth.ready;
    if (this.auth.hasRole(USER_ROLES.ADMIN)) {
      void this.router.navigateByUrl('/app/admin', { replaceUrl: true });
    } else if (this.auth.hasRole(USER_ROLES.OWNER)) {
      void this.router.navigateByUrl('/app/owner', { replaceUrl: true });
    } else if (this.auth.hasRole(USER_ROLES.PROFESSIONAL)) {
      void this.router.navigateByUrl('/app/professional', { replaceUrl: true });
    } else {
      void this.router.navigateByUrl('/app/client', { replaceUrl: true });
    }
  }
}