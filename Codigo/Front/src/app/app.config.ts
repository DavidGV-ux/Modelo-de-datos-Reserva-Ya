import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideOAuthClient } from 'angular-oauth2-oidc';

import { routes } from './app.routes';
import { auth401Interceptor } from './core/http/auth-401.interceptor';
import { provideI18n } from './core/i18n/i18n.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withViewTransitions(),
    ),
    provideHttpClient(withFetch(), withInterceptors([auth401Interceptor])),
    provideAnimationsAsync(),
    provideClientHydration(withEventReplay()),
    provideOAuthClient(),
    ...provideI18n(),
  ],
};