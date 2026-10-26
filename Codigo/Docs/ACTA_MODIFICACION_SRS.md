# Acta de Modificación — SRS ReservaYa

**Fecha**: 2026-09-09
**Ámbito**: Alcance declarado del sistema (SRS) vs. funcionalidad implementada.
**Motivo**: el alcance original no contemplaba registro self-service de negocios ni
gestión de identidad; ambos fueron incorporados durante el desarrollo del módulo de
**Identidad y Registro**.

---

## 1. Cambios respecto al SRS

| # | Sección original | Cambio | Estado |
| - | ---------------- | ------ | ------ |
| 1 | **Alcance**: "alta asistida de negocios por un administrador" | Se **amplía** para incluir **alta self-service** por el propio dueño (plan Básico automático), sin perder la alta asistida (Admin) | Aprobado |
| 2 | **Registro de clientes**: "registro manual en Keycloak" | Se formaliza como **registro autónomo** vía flujo OIDC standard; el back solo concede roles y enlaza membresías | Aprobado |
| 3 | **Gestión de usuarios profesionales** | Se **adiciona** la operación de **invitación de profesionales** (`POST /api/owner/:tenantId/professionals/invite`), que crea o vincula el usuario en Keycloak | Aprobado |
| 4 | **Arquitectura** | Se documenta la **arquitectura hexagonal** del back y el patrón **SSR + proxy `/api`** del front (ver `ARQUITECTURA_HEXAGONAL.md`) | Aprobado |
| 5 | **Roles** | Se confirman los roles realm `ry_owner`, `ry_professional`, y se mantienen `ry_client`/`ry_admin` para el control de acceso por panel | Aprobado |

## 2. Requisitos funcionales resultantes

- **RF-A1** Alta self-service: el dueño autenticado crea su negocio con slug, nombre,
  país/moneda y settings básicos; se le concede `ry_owner`. *(Entregado)*
- **RF-A2** Captura del negocio: la URL pública queda en `reserwaya.com/[slug]` y el
  negocio aparece en el directorio público. *(Entregado)*
- **RF-A3** Invitación de profesionales: el owner invita por correo; el sistema crea o
  vincula el usuario Keycloak y le concede `ry_professional`. *(Entregado)*
- **RF-A4** Registro de clientes: autónomo vía Keycloak (OIDC PKCE). *(Entregado)*
- **RF-A5** Landing de plataforma con directorio público de negocios activos.
  *(Entregado, front)*
- **RF-A6** Wizard de registro de negocio en front conectado al back. *(Entregado, front)*

## 3. Requisitos no funcionales confirmados/actualizados

- **RNF-Seg-1** Todo endpoint de escritura requiere token JWT válido (`requireAuth`).
- **RNF-Seg-2** La invitación de profesionales requiere membresía `owner` del tenant.
- **RNF-Seg-3** Las credenciales de admin Keycloak nunca se usan desde el back; se usa
  service account con `realm-admin` (secreto de Lambda / `.env`).
- **RNF-Perf-1** El onboarding y la invitación se completan en el límite de 30s del
  Lambda (invocations típicas 140–300 ms).
- **RNF-Int-1** El front consume el back por el mismo origen mediante proxy SSR
  (`BACK_API_URL`), sin CORS en producción.

## 4. Trazabilidad y validación

- **Back**: tests de integración (29/29) cubriendo onboarding, invitación y directorio
  (con `NoopIdentityGateway` en test).
- **E2E en Lambda (prod)**: onboarding `201`, invite `201`, directorio público `200`,
  `ry_owner` concedido automáticamente.
- **Front**: `ng build` OK; SSR verificado localmente para `/`, `/crear-negocio` y
  `/barber-estilo`; proxy `/api` responde `503` sin `BACK_API_URL`.
- **N/A**: cancelación del alta asistida — se conserva como pendiente opcional.

## 5. Firmas

| Rol | Nombre | Fecha |
| --- | ------ | ----- |
| Arquitecto / Desarrollador | Equipo ReservaYa | 2026-09-09 |