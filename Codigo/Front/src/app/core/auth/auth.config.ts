import { AuthConfig } from 'angular-oauth2-oidc';

export interface KeycloakEnv {
  issuer: string;
  clientId: string;
  scope: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  responseType: string;
  sessionChecksEnabled: boolean;
  timeOut: number;
}

export function authConfig(env: KeycloakEnv): AuthConfig {
  return {
    issuer: env.issuer,
    clientId: env.clientId,
    scope: env.scope,
    redirectUri: env.redirectUri,
    postLogoutRedirectUri: env.postLogoutRedirectUri,
    responseType: env.responseType,
    sessionChecksEnabled: env.sessionChecksEnabled,
    strictDiscoveryDocumentValidation: false,
    requireHttps: false,
    useSilentRefresh: true,
  };
}