import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideOAuthClient, OAuthStorage } from 'angular-oauth2-oidc';

import { routes } from './app.routes';
import { auth401Interceptor } from './core/http/auth-401.interceptor';
import { provideI18n } from './core/i18n/i18n.config';

/**
 * Keycloak no incluye el claim `nonce` en el id_token del flujo Direct Access
 * Grant (login automático tras verificar el WhatsApp). Devolver `undefined`
 * cuando no hay un nonce guardado permite que la librería acepte ese id_token
 * sin desactivar la validación de nonce del flujo normal de autorización.
 */
function oauthStorageFactory(): OAuthStorage {
  const memory = new Map<string, string>();
  const storage = (): Storage | null =>
    typeof sessionStorage === 'undefined' ? null : sessionStorage;

  return {
    getItem(key: string): string | null {
      const target = storage();
      const value = target ? target.getItem(key) : (memory.get(key) ?? null);
      return (key === 'nonce' && value === null ? undefined : value) as string | null;
    },
    setItem(key: string, data: string): void {
      const target = storage();
      if (target) target.setItem(key, data);
      else memory.set(key, data);
    },
    removeItem(key: string): void {
      const target = storage();
      if (target) target.removeItem(key);
      else memory.delete(key);
    },
  };
}

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
    { provide: OAuthStorage, useFactory: oauthStorageFactory },
    ...provideI18n(),
  ],
};