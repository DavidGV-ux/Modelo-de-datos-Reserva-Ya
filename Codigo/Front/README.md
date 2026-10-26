# ReservaYa — Front (Angular SSR)

Front end del SaaS de reservas multi-tenant **ReservaYa** (Grupo N°3 — Software 1), construido con
**Angular 21** en modo **SSR**, **Angular Material 3**, **Keycloak (OIDC)** y **i18n es/en**
(predeterminado: es + COP). El backend API y la base de datos quedan fuera de este repositorio.

## Arquitectura

Flujo de reserva público (servicios → profesional → día/hora → datos + habeas data → pago simulado →
confirmación) e historial, más paneles `owner`, `professional`, `client` y `admin`. En dev los datos
vienen de mocks; la API se integra vía `ApiService` (`src/app/core/http/api.service.ts`) apuntando a
`environment.apiBaseUrl`.

```
Cliente ──► CloudFront
              ├─ /assets/*, /*.js, /*.css ──► S3      (activos inmutables, cache 1 año, Origin Access Control)
              └─ *                         ──► Lambda (Lambda Web Adapter + Function URL)
                                                └─ Express / AngularNodeAppEngine (SSR, no-store)
```

## Módulos de la app

| Carpeta                            | Contenido                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| `src/app/core`                     | config, http, auth (OIDC), i18n, seo, theme                  |
| `src/app/shared`                   | pipes (money, currency, date-tz), layout, datos de mock      |
| `src/app/features/public-portal`   | landing/`home`, `services`, `booking`, `confirmation`, `history` |
| `src/app/features/owner`           | overview, services-mgmt, professionals                       |
| `src/app/features/professional`    | my-schedule                                                  |
| `src/app/features/client`          | my-appointments                                              |
| `src/app/features/admin`           | tenants                                                      |

## Requisitos

- Node **22.x**, npm (proyecto pinneado a `npm@11.19.0` en `package.json`).
- Angular CLI 21 (`npx ng`).
- Docker (solo para deploy).
- AWS CLI + credenciales (`aws configure`) (solo para deploy).

## Puesta en marcha (dev)

```bash
npm ci --legacy-peer-deps   # requerido por un bug de resolución del arborista de npm
npm start                   # http://localhost:4200
```

- `useMockBackend: true` por defecto (`src/app/core/config/environment.ts`): el flujo público y los
  paneles (`/app/*`) funcionan sin backend ni Keycloak.
- Para el login real, levantar Keycloak (ver abajo) y cambiar `useMockBackend` si se desea.

## Keycloak (reino `reserwaya`)

La app funciona tanto con Keycloak local (`npm start` → `http://localhost:8080`, en `environment.ts`)
como con el **Keycloak alojado en AWS** para producción (`environment.prod.ts`):

- Keycloak alojado: `https://d5mklesn5mbc7.cloudfront.net` (consola `/admin`, EC2 t3.micro + Postgres
  en Docker + CloudFront). Detalles, credenciales y mantenimiento en `deploy/keycloak/README.md`.
- Issuer prod: `https://d5mklesn5mbc7.cloudfront.net/realms/reserwaya`.

Configuración esperada por la app (`environment.ts` / `environment.prod.ts`):

- Client público `reserwaya-web`.
- Redirect URI: `http://localhost:4200/auth/callback` (dev) o el dominio CloudFront + `/auth/callback` (prod).
- Roles del reino (gateadas por los guards de `/app/*`):
  `ry_admin`, `ry_owner`, `ry_professional`, `ry_client`.
- **Protocol mapper** en el cliente `reserwaya-web`: mapper *Realm roles*
  (`oidc-usermodel-realm-role-mapper`) con *Claim Name* `realm_access.roles` y
  *Add to ID token* ON. Keycloak 25+ no incluye `realm_access` en el id_token y,
  sin mapper, el login funciona pero los guards no ven los roles. La app también
  los lee del access_token como respaldo.
- Registro de usuarios habilitado: todo usuario nuevo recibe `ry_client` (compuesto en el rol
  por defecto del realm), por lo que puede entrar a `/app/client` y `mi-historial`.
- Issuer local dev: `http://localhost:8080/realms/reserwaya`.

> En SSR, las rutas `/app/**` y `/auth/**` se sirven como CSR (`RenderMode.Client`) justamente para
> que el guard OIDC no corra server-side (`src/app/app.routes.server.ts`).

## Tests y build

```bash
npm test                      # vitest + jsdom
npm run build                 # genera dist/reserwaya/{browser,server}
npm run serve:ssr:reserwaya   # levanta el bundle SSR en http://localhost:4000
```

## Deploy AWS (S3 + Lambda SSR + CloudFront)

El stack CDK vive en `deploy/infra`; la imagen de Lambda se construye con el Dockerfile de
`deploy/docker/Dockerfile` usando **Lambda Web Adapter** (la carpeta `server/` y `browser/` del bundle
deben quedar como siblings porque `server.mjs` resuelve `../browser`).

```bash
# 1. Build de la app (la imagen empaqueta dist/reserwaya)
npm run build

# 2. Instalar dependencias de CDK (una vez)
npm --prefix deploy/infra install

# 3. Verificar el template (requiere Docker)
npm run deploy:synth

# 4. Desplegar
npm run deploy              # o: cd deploy/infra && npm run deploy
```

Al terminar se imprimen los outputs `CloudFrontUrl` y `SsrFunctionUrl`.

Notas:

- `NG_ALLOWED_HOSTS=*` se inyecta en la Lambda (demo). Al usar dominio propio, restringirlo al dominio
  en `deploy/infra/lib/reserwaya-front-stack.ts`.
- `NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-host,x-forwarded-proto,x-forwarded-port` es
  **obligatorio**: sin él, el Lambda Web Adapter inyecta cabeceras `x-forwarded-*` y el motor SSR cae
  al shell CSR (`index.csr.html`).
- Dominio/ACM custom (cert en `us-east-1`) + Route53 **no** están implementados aún en el stack.
- `Budget`: `dist` no debe quedar grande; los límites actuales de producción están en `angular.json`
  (800 kB warning / 1,2 MB error).