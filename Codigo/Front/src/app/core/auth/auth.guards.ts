import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from './auth.service';
import { UserRole } from './roles';

export function requireAuth(): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    await auth.ready;
    if (auth.hasAccessToken) {
      return true;
    }
    return firstValueFrom(auth.login().pipe(map((authenticated) => {
      if (authenticated) {
        return true as boolean | UrlTree;
      }
      return inject(Router).createUrlTree(['/']) as UrlTree;
    })));
  };
}

export function requireRoles(roles: UserRole[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    await auth.ready;
    if (auth.hasAccessToken) {
      return auth.hasAnyRole(roles) ? true : (inject(Router).createUrlTree(['/']) as UrlTree);
    }
    return firstValueFrom(auth.login().pipe(map((authenticated) => {
      if (!authenticated) {
        return inject(Router).createUrlTree(['/']) as UrlTree;
      }
      return auth.hasAnyRole(roles) ? true : (inject(Router).createUrlTree(['/']) as UrlTree);
    })));
  };
}

export function hasRole(role: UserRole): boolean {
  return inject(AuthService).hasRole(role);
}