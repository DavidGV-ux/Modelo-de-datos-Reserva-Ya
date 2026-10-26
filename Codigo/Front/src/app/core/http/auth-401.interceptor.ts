import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../config/environment';

export const auth401Interceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        const isApiCall = req.url.startsWith(environment.apiBaseUrl);
        if (isApiCall) {
          inject(AuthService).logout();
          void inject(Router).navigate(['/']);
        }
      }
      return throwError(() => err);
    }),
  );