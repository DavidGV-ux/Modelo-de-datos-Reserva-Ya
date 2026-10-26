export const environment = {
  production: false,
  useMockBackend: true,
  apiBaseUrl: '/api',
  appVersion: 'dev',
  keycloak: {
    issuer: 'http://localhost:8080/realms/reserwaya',
    clientId: 'reserwaya-web',
    scope: 'openid profile email roles',
    redirectUri: 'http://localhost:4200/auth/callback',
    postLogoutRedirectUri: 'http://localhost:4200',
    responseType: 'code',
    sessionChecksEnabled: false,
    timeOut: 1_800_000,
  },
};