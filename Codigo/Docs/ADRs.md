# Registro de Decisiones de Arquitectura (ADR)

Historias de decisiones relevantes asociadas al módulo de **Identidad y Registro**
(alta self-service de negocios, registro de clientes e invitación de profesionales).

| # | ADR | Estado |
| - | --- | ------ |
| 1 | Registro reutiliza Keycloak (no un registro propio) | Aceptado |
| 2 | Rol `ry_owner` concedido sobre usuario ya autenticado | Aceptado |
| 3 | `IdentityGateway` como puerto hexagonal (anti lock-in) | Aceptado |
| 4 | `KeycloakAdminGateway` con service account + `realm-admin` | Aceptado |
| 5 | Invitación de profesional crea o **linkea** usuario Keycloak | Aceptado |
| 6 | Directorio público desacoplado vía `GET /api/public/tenants` | Aceptado |
| 7 | Proxy `/api` en SSR en lugar de CORS | Aceptado |
| 8 | Wizard de registro con localStorage para el tenant owner | Aceptado |
| 9 | Landa y onboarding en mock-first (dev) con fallback a API real (prod) | Aceptado |

---

## ADR-1 — Registro reutiliza Keycloak (no un registro propio)

**Contexto**: el sistema necesitaba registro de clientes y, ahora, alta self-service de
negocios. Mantener tablas `users` propias y sincronizarlas con Keycloak duplicaría
estado y riesgo de inconsistencia.

**Decisión**: todo login/registro primario ocurre en Keycloak (flujo OIDC estándar,
PKCE, `angular-oauth2-oidc`). La plataforma **no crea usuarios** durante el registro;
los usuarios llegan ya autenticados al back y la plataforma solo **concede roles** y
enlaza membresías de tenant.

**Consecuencias**:
- El back no maneja contraseñas, verificación de correo ni MFA.
- La invitación de profesionales es la única excepción: crea el usuario en KC en nombre
  del owner (con contraseña temporal).

---

## ADR-2 — Rol `ry_owner` concedido sobre usuario ya autenticado

**Contexto**: al crear un negocio con el onboarding self-service, el usuario autenticado
debe convertirse en owner de ese tenant.

**Decisión**: no se vuelve a registrar al usuario; se le concede el rol de realm
`ry_owner` vía Admin REST (`ensureRealmRole`) y se inserta en `tenant_users` con rol
`owner`.

**Consecuencias**:
- El rol se refleja en el siguiente access token (el front refresca tras onbordeo).
- Es idempotente: reintentar el onboarding no duplica el grant.

---

## ADR-3 — `IdentityGateway` como puerto hexagonal

**Contexto**: el módulo de onboarding necesita operaciones de identidad (crear usuario,
conceder rol, buscar por correo/sub).

**Decisión**: se declara el puerto `IdentityGateway` en `domain/ports/gateways.ts` y se
implementa únicamente el adaptador Keycloak. La lógica de negocio (OnboardingUseCases)
depende del puerto, no de Keycloak.

**Consecuencias**:
- Tests unitarios pueden inyectar un `NoopIdentityGateway`.
- Migrar a Cognito/Auth0 sería añadir un adaptador sin tocar el dominio.

---

## ADR-4 — `KeycloakAdminGateway` con service account + `realm-admin`

**Contexto**: el back necesita permisos de administración en Keycloak sin credenciales de
admin compartidas.

**Decisión**: se crea el cliente confidencial `reserwaya-back` con service account; a esa
service account se le asigna el rol `realm-admin` del client `realm-management`.

**Consecuencias**:
- El secreto vive en `.env`/secretos de Lambda (`OIDC_ADMIN_CLIENT_SECRET`).
- Solo se exponen los endpoints Admin REST necesarios, no la UI ni la consola.

---

## ADR-5 — Invitación de profesional crea o linkea el usuario

**Contexto**: los profesionales pueden no ser usuarios existentes.

**Decisión**: `inviteProfessional` busca por email; si no existe, crea el usuario en
Keycloak con contraseña temporal y `ry_professional`; si existe, solo lo linkea al
tenant y le concede `ry_professional`. En ambos casos se persiste el `professional` y la
fila en `tenant_users`.

**Consecuencias**:
- Un correo ya registrado (p. ej. un cliente) se reutiliza sin duplicarlo.
- `temporaryPassword` llega al owner en la respuesta para su entrega segura.

---

## ADR-6 — Directorio público desacoplado

**Contexto**: la landing necesita listar negocios activos sin autenticación ni
exponer el portal interno.

**Decisión**: endpoint público `GET /api/public/tenants` que devuelve solo campos de
presentación (`slug`, `name`, `tagline`, `description`, `country`, `currency`,
counters) de tenants activos.

**Consecuencias**:
- La landing funciona sin login y sin tokens.
- No se filtran datos internos (plan, saldos, horarios internos).

---

## ADR-7 — Proxy `/api` en SSR en lugar de CORS

**Contexto**: el front y el back viven en dominios distintos (CloudFront del front y API
Gateway del back), y las llamadas al back requieren headers custom (i18n, tenant) y JWT.

**Decisión**: el servidor SSR (Express, mismo origen) hace proxy de `/api/*` hacia
`BACK_API_URL`, ocultando la URL del backend al navegador.

**Consecuencias**:
- Sin CORS en producción; el navegador solo habla con el origen propio.
- Si falta `BACK_API_URL`, el proxy responde 503 de forma explícita (fail-loud).

---

## ADR-8 — Wizard con localStorage para el tenant owner

**Contexto**: tras crear el negocio, el dueño debe aterrizar en `/app/owner` (mock-driven
hoy) y las páginas owner necesitan un `tenantId`.

**Decisión**: el wizard guarda `reserwaya.ownerTenant` (tenantId) en `localStorage` y
navega a `/app/owner`.

**Consecuencias**:
- Es una solución puente mientras los owner pages se conectan a la API real.
- Mismo origen (SSR + SPA) ⇒ sin fricción con el proxy.

---

## ADR-9 — Mock-first en dev, API real en prod

**Contexto**: el desarrollo local no siempre corre Mongo/Keycloak/Atlas.

**Decisión**: `environment.useMockBackend` alterna entre respuestas mock (`of([...])`)
y llamadas reales a `/api/*`. Las rutas se mantienen idénticas en ambos modos.

**Consecuencias**:
- La UI es desarrollable offline; el cambio a prod es solo de configuración
  (`environment.prod.ts` con `useMockBackend: false`).
- Riesgo de divergencia mock/API mitigado por tests de integración del back (29/29).
---

## ADR-10 — Pasarela de pagos por configuración (seam `PaymentGatewayProvider`)

**Contexto**: el backend operaba con un único adaptador mock hardcodeado en
`bootstrap.ts`, ignorando `env.paymentProvider`; los webhooks de pago se normalizaban
sin verificación de firma y la expiración de pagos sin confirmar era inexistente
(RNF-21).

**Decisión**:
- `bootstrap` construye el gateway de pagos mediante la fábrica
  `buildPaymentGateway()` según `PAYMENT_PROVIDER` (`mock | wompi | payu`), con
  **fail-fast** si faltan secretos del proveedor seleccionado.
- Los adaptadores reales (`WompiPaymentGateway`, `PayuPaymentGateway`) implementan el
  puerto `PaymentGatewayProvider`: `createCharge`, `createRefund` y `confirmEvent`.
- `confirmEvent` recibe un *envelope* `{ raw, headers, body }` y **verifica la firma**
  antes de normalizar: checksum SHA-256 para Wompi (valores de `signature.properties`
  + timestamp + events secret) y sign MD5 `apiKey~merchant~reference~value~currency~
  state_pol` para PayU.
- La ruta de webhooks demo queda restringida a `PAYMENT_PROVIDER=mock`.
- El scheduler de expiración (`expirePendingPayments`) se ejecuta por cron
  (EventBridge) y respeta el `paymentTimeoutMinutes` por tenant.

**Consecuencias**:
- Cambiar de proveedor es solo configuración, sin tocar casos de uso (hexagonal).
- Los eventos no firmados o manipulados son rechazados (`EVENT_SIGNATURE_INVALID`).
- El ledger acumula asientos también para pagos rechazados/expirados
  (`payment_rejected`), manteniendo auditabilidad.
- Requiere provisionar secretos del proveedor (secrets manager / env) en despliegue.

**Cambios posteriores (2026-09, API actual Wompi v2)**:
- Wompi ahora exige autenticarse por **llave privada** (`Authorization: Bearer`),
  firma de integridad `signature = SHA-256(reference + amount_in_cents + currency +
  integritySecret)` y doble token de aceptación (`acceptance_token` +
  `accept_personal_auth`) resueltos vía `GET /merchants/info` con header
  `x-merchant-public-key` (el endpoint antiguo `GET /merchants/:key` se deprecia el
  2026-10-31). Reembolsos V2 en `POST /v1/refunds`.
- Nuevo método del puerto `buildChargeIntent`: genera un *intent hosteado*
  (`chargeMode`, `publicKey`, `amountInCents`, `signatureIntegrity`) para el
  **Checkout Widget** de Wompi, de modo que el front nunca tiene secretos y la
  cartera solo vive en el iframe cifrado del proveedor (PCI).
  `BookingUseCases.createAppointment` usa `buildChargeIntent` cuando el booking no
  incluye un token de pago, y `createCharge` (server-to-server) cuando sí lo incluye.

---

## ADR-11 — Backup de BD en Node puro con `bson`, no Layer ni contenedor

**Contexto**: el plan I4 proponía un Lambda `export-backup-r2` usando `mongodump`
empaquetado como Layer.

**Decisión**: implementar el backup con el paquete `bson` (ya dependencia del Back):
se serializan colecciones a `.bson.gz` dentro de un `.tar.gz` y se sube a R2
(endpoint S3-compatible) con el SDK de AWS; retención por lifecycle rule.

**Consecuencias**:
- Sin binarios externos ni contenedor ECR: misma función zip que ya se despliega.
- Sin riesgo de exceder el límite de 250 MB sin comprimir de Lambda.
- Costo ~US$0 (R2 ofrece 10 GB gratis; Lambda y EventBridge dentro del free tier).
