# Arquitectura Hexagonal — ReservaYa

Documento de referencia de la arquitectura del sistema Reservation Platform.
Actualizado al incorporar el módulo de **Identidad y Registro** (alta self-service de
negocios, registro de clientes vía Keycloak e invitación de profesionales).

## 1. Principios

- **Dominio aislado de infraestructura**: la lógica de negocio no importa nada de
  Express, MongoDB, Keycloak ni AWS.
- **Puertos y adaptadores**: el dominio declara *puertos* (interfaces) y la
  infraestructura los implementa (adaptadores) y los inyecta en tiempo de *composición*.
- **Sin anillos hacia adentro**: `application` puede importar de `domain`; `infrastructure`
  puede importar de `domain` y `application`; `entrypoints` (HTTP) depende de `application`.
- **Keep it small**: cada caso de uso es una operación explícita, sin DTOs anémicos.

## 2. Back (Node/Express + MongoDB Atlas + Keycloak)

```
entrypoints/           Capa de entrada (HTTP)
  http/
    server.ts          Monta routers, middleware de errores
    routes/
      public.routes.ts        GET /api/public/tenants     (directorio público)
      onboarding.routes.ts    POST /api/onboarding/tenants (alta self-service)
      roles.routes.ts         POST /api/owner/:tenantId/professionals/invite
      ... reservas, servicios, profesionales
    middleware/
      auth.ts           requireAuth (KeycloakVerifier)
      errors.ts         asyncRoute + errorHandler (loguea errInfo serializado)

application/           Casos de uso (orquestan dominio + puertos)
  usecases/
    onboarding/onboarding.usecases.ts   OnboardingUseCases
      - onboardTenant        (crea tenant plan basico + owner + ry_owner)
      - inviteProfessional   (crea/linkea usuario KC + ry_professional)
      - publicDirectory      (lista tenants activos)
  container.ts          AppDependencies + AppServices (composición raíz)

domain/                Núcleo: entidades, reglas, tipos + PUERTOS
  entities/
  ports/
    repositories.ts     TenantRepository, ProfessionalRepository, ...
    gateways.ts         IdentityGateway   <- NUEVO puerto
      ensureRealmRole(sub, role)
      createUser({ ... })
      findByEmail(...)
      findBySub(...)
  services/

infrastructure/        Adaptadores concretos
  auth/
    keycloak.ts             KeycloakVerifier (validación de tokens)
    keycloak-admin.ts       KeycloakAdminGateway  <- NUEVO adaptador (service account + realm-admin)
  mongo/
    mongo-bootstrap.ts      MongoClient + dbs
    mongo-tenant.repository.ts, ...
  bootstrap.ts           Construye gateways desde env y devuelve AppDependencies
  models/                Schemas Mongo + $jsonSchema de Atlas
```

### 2.1 Identidad (Keycloak)

**Puerto `IdentityGateway`** (`domain/ports/gateways.ts`):

```ts
export interface IdentityGateway {
  ensureRealmRole(sub: string, role: RealmRole): Promise<void>;
  createUser(input: CreateIdentityUser): Promise<IdentityUser>;
  findByEmail(email: string): Promise<IdentityUser | null>;
  findBySub(sub: string): Promise<IdentityUser | null>;
}
```

**Adaptador `KeycloakAdminGateway`** (`infrastructure/auth/keycloak-admin.ts`):

- Usa el cliente confidencial `reserwaya-back` (service account) con el rol
  `realm-admin` del client `realm-management` para llamar al Admin REST.
- Los roles (`ry_owner`, `ry_professional`) son **realm roles**; se conceden a usuarios
  existentes (owner que entra por primera vez) y se crean junto con el usuario en las
  invitaciones.
- Config por env: `OIDC_ADMIN_BASE_URL`, `OIDC_ADMIN_CLIENT_ID`,
  `OIDC_ADMIN_CLIENT_SECRET`, `IDENTITY_REALM`.

**Endpoints del módulo:**

| Método | Ruta | Auth | Descripción |
| ------ | ---- | ---- | ----------- |
| GET  | `/api/public/tenants`                          | pública  | Directorio de negocios activos para la landing |
| POST | `/api/onboarding/tenants`                      | access token | Alta self-service: crea tenant (plan basico) + `tenant_users` owner + concede `ry_owner` |
| POST | `/api/owner/:tenantId/professionals/invite`    | owner membership | Crea/linkea usuario KC + `ry_professional` + professional + `tenant_users` |

### 2.2 Decisiones relevantes

- El **owner no se crea en Keycloak**: se espera que ya esté autenticado por el flujo
  estándar (registro de cliente) y se le concede el rol `ry_owner` sobre su tenant.
- Las invitaciones de profesionales crean el usuario Keycloak con una contraseña
  temporal (o lo **linkean** si el correo ya existe) y asignan `ry_professional`.
- La concesión de roles es **idempotente** (`ensureRealmRole`).
- Los settings del tenant se fusionan manualmente (solo claves definidas) para no violar
  el `$jsonSchema` de Atlas (fix del bug `undefined` → `null`).

## 3. Front (Angular SSR standalone)

```
src/
  server.ts                     Express SSR: proxy /api -> BACK_API_URL
  app/
    app.config.ts               providers (router, http, i18n, oauth)
    app.routes.ts               landing('/'), crear-negocio, app/**, :tenantSlug
    layouts/
      platform-layout/          Header/sidenav/footer de la plataforma (landing + setup)
      public-layout/            Portal de un negocio
      dashboard-layout/         Panel owner/professional/client/admin
    core/
      auth/                     AuthService (OIDC), roles, guards, callback
      config/environment.ts     useMockBackend / apiBaseUrl / keycloak
      http/api.service.ts       GET/POST/PUT/PATCH/DELETE con headers i18n + tenant
      i18n/                     Traducciones es/en
      seo/                      Meta tags SSR
    features/
      platform/                 LandingPage, BusinessSetupPage, PlatformService
      owner/                    Overview, services, professionals (+ InviteDialog), reports
      public-portal/            Home, services, booking, confirmation, history
      professional/  client/  admin/ ...
    shared/                     models, mocks, pipes, components, guards
```

- **Landing** (`/`): hero + estadísticas + cómo funciona + directorio de negocios
  (llama `GET /api/public/tenants`, con fallback mock en dev) + CTA a `/crear-negocio`.
- **Registro de negocio** (`/crear-negocio`): wizard con stepper; gated por login
  Keycloak; publica `POST /api/onboarding/tenants`; guarda `reserwaya.ownerTenant` en
  localStorage y navega a `/app/owner`.
- **Proxy `/api`**: el server Express (Lambda Web Adapter) hace forward hacia
  `BACK_API_URL` para evitar CORS y mantener el mismo origen.

## 4. Despliegue (AWS)

```
CloudFront (front)
 ├── S3 (assets inmutable, cache L1 edge)
 └── Lambda SSR (Angular SSR + proxy /api)  --BACK_API_URL-->  API Gateway (back)
                                                                  └── Lambda (serverless)
Keycloak (CloudFront -> ECS): realm 'reserwaya', clients
  'reserwaya-web' (público, OIDC PKCE) + 'reserwaya-back' (confidencial, service account)
MongoDB Atlas (M0, cluster 'reserwaya-cluster')
```