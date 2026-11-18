export const environment = {
  production: true,
  useMockBackend: false,
  apiBaseUrl: 'https://qa0x18nga6.execute-api.us-east-1.amazonaws.com/api',
  appVersion: '2026-11-06-4',
  keycloak: {
    issuer: 'https://d153xy2c1um3rw.cloudfront.net/realms/reserwaya',
    clientId: 'reserwaya-web',
    scope: 'openid profile email roles',
    redirectUri: 'https://djbfmoum5t7ct.cloudfront.net/auth/callback',
    postLogoutRedirectUri: 'https://djbfmoum5t7ct.cloudfront.net/',
    responseType: 'code',
    sessionChecksEnabled: false,
    timeOut: 1_800_000,
  },
};