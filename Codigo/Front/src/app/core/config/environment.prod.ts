export const environment = {
  production: true,
  useMockBackend: false,
  apiBaseUrl: '/api',
  appVersion: '2026-09-25-2',
  keycloak: {
    issuer: 'https://d5mklesn5mbc7.cloudfront.net/realms/reserwaya',
    clientId: 'reserwaya-web',
    scope: 'openid profile email roles',
    redirectUri: 'https://d1ydnh3hbo1zxr.cloudfront.net/auth/callback',
    postLogoutRedirectUri: 'https://d1ydnh3hbo1zxr.cloudfront.net',
    responseType: 'code',
    sessionChecksEnabled: false,
    timeOut: 1_800_000,
  },
};