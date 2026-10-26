# Plan de Finalización — ReservaYa (Grupo N°3 · Software 1)

**Fecha**: 2026-09-10
**Objetivo**: cerrar el MVP de Fase 1 (SRS ReservaYa) con código estable en AWS,
componentes externos reales (pagos + notificaciones + WhatsApp) y la documentación
académica completa, en 6 semanas, con 5 integrantes.

---

## 1. Estado actual (qué está hecho vs. qué falta)

### Hecho y verificado en producción
- **Back hexagonal** (`Codigo/Back`, Node/TS + Express + Mongo Atlas + Keycloak), desplegado como Lambda
  `reserwaya-back-prod-api` (API Gateway HTTP). Módulos: tenants, catálogo (servicios/profesionales),
  onboarding self-service + invitación + directorio público, booking con **anti-cruce real**
  (colección `time_slots` + índice único `{tenant_id, professional_id, slot_start}`; cumple RNF-02),
  disponibilidad pública, pagos con webhook (dedupe + ledger), dashboard/overview, historial, admin.
- **Tests**: 32/32 (unit + integración). Verificación unitaria de capas: dominio y aplicación limpios.
- **Front Angular 21 SSR** (`Codigo/Front`, CDK → CloudFront + S3 + Lambda SSR + proxy `/api`):
  landing, portal público (home/servicios/reserva/confirmación/historial), wizard de registro,
  paneles owner (overview/servicios/profesionales+invite), profesional (agenda), cliente (mis citas),
  admin (tenants), i18n es/en, SEO SSR. Verificado live.
- **Keycloak** alojado (EC2 t3.micro + Postgres + CloudFront) con realm `reserwaya`, clientes
  `reserwaya-web` (PKCE) y `reserwaya-back` (service account) y roles ry_{admin,owner,professional,client}.
- **Datos demo** en prod: tenant `t_barber_estilo` + `cafe-beta-prod`, usuarios david/laura/prueba.
- **Docs parciales**: `Codigo/Docs/` (ACTA_MODIFICACION_SRS, ADR-1..9, ARQUITECTURA_HEXAGONAL) y
  diagramas hexagonales (`.drawio`/`.mmd`). Análisis previo del SRS en `Prompts/`.

### Pendiente / huecos
| # | Área | Hueco |
| - | ---- | ----- |
| 1 | Pagos | Solo `MockPaymentGateway`; **falta PayU o Wompi real** (adapter + firma + pruebas sandbox). `bootstrap.ts` hardcodea el mock e ignora `env.paymentProvider`; `webhooks.routes.ts` importa `MockPaymentEvent`. |
| 2 | Notificaciones | Solo `MockNotificationGateway`; **falta integración real** (WhatsApp + Resend email/SMS) para confirmaciones, recordatorios y cancelaciones. |
| 3 | WhatsApp IA | ``IA whatsapp`` es un servicio **legacy standalone** (index.js monolítico, Supabase, OpenAI) desacoplado del back nuevo; **falta reconectarlo** al back (crear reserva, enlace de pago, SQS, webhook Meta, Groq). |
| 4 | Expiración de pagos | **RNF-21**: no hay scheduler que expire citas `pending_payment` (liberar slots/refund si se adelantó). |
| 5 | Front enriquecimiento | Owner **reports/ingresos** (página o refuerzo de overview), UI de **cancelación** en historial/mis-citas, cobertura i18n completa, tests unitarios de front. |
| 6 | Infra | **Backups a Cloudflare R2** + EventBridge (no existe aún); dominio custom + ACM/Route53; **CI** (GitHub Actions); secretos de `.env` → Secrets Manager; alertas/monitorización. |
| 7 | Seguridad/dominio | Limpieza de secretos en `.env`; rol de BD **append-only** para `ledger` en Atlas; prueba de concurrencia/race que certifique RNF-02. |
| 8 | Docs | Matriz de trazabilidad RF/RN/RNF, plan + evidencia de pruebas, manual de usuario, runbook de operaciones, ADRs nuevos, diagramas finales (despliegue/datos/casos de uso), acta de cierre, demo/video, SRS final consolidado. |

---

## 2. Supuestos

- 6 semanas (Sem 1–6), ~2 sprints/semana; entregable parcial cada semana acordada.
- El **alcance de Fase 1** no incluye liquidación bancaria semanal ni suspensión por saldo
  (RN-5.7/5.8/5.9): solo diseño documentado. No implementar.
- PayU y Wompi requieren credenciales de **sandbox**: un integrante gestiona la cuenta de pruebas.
- Los integrantes trabajan en paralelo: backend (I1, I2), front (I3), infra (I4), docs/QA (I5).
- Flujo de trabajo: Git por features + PR, code review cruzado, kanban/standups, integración semanal.

---

## 3. Reparto por integrante

### I1 — Pagos reales y motor de expiración (Back)
- [ ] Refactor del seam de proveedores: `bootstrap.ts` elige gateway por `env.paymentProvider`
  (`mock` | `payu` | `wompi`) y `env.whatsappProvider`; mover `buildDemoEvent` a `mock-payment.ts`
  (quitar import de `MockPaymentEvent` en `webhooks.routes.ts`).
- [ ] Implementar **Wompi adapter** (o PayU): crea cargo/anticipo, refund, `confirmEvent` con
  verificación de firma (x-signature HMAC-SHA256 / PayU firma MD5) y normalización a los eventos
  del puerto `PaymentGatewayProvider`. Soporte de eventos `payment.approved`/`refund.succeeded`.
- [ ] Tests de integración con FakeWompi/FakePayU (stub de pasarela) + casos: cargo→aprobación→ledger
  (2 asientos: comisión + saldo tenant), dedupe de webhook (replay), refund tras cancelación.
- [ ] **Scheduler de expiración (RNF-21)**: caso de uso `expirePendingPayments` + ruta/handler
  invocable por EventBridge (cron cada 5 min): expira citas `pending_payment` vencidas, libera
  `time_slots`, marca `expired`, y si hubo adelanto real → refund automático + asiento ledger.
- [ ] Probar en sandbox Wompi/PayU (cargo real de prueba → webhook → confirmación) y actualizar
  entorno prod solo cuando el sandbox sea verde.
- [ ] Test de concurrencia que **certifique RNF-02**: N reservas simultáneas al mismo slot → exactamente 1 confirma y el resto 409.
- [ ] Entregable: revisión de `typecheck` y suite completa verde; ADR-10 (migración a pasarela real).

### I2 — Notificaciones + WhatsApp IA conectado al back
- [ ] Puerto/adaptador `NotificationGateway` resolviendo por env (`mock` | `resend`): implementar
  **Resend** (email) como canal de respaldo; guardar intención en `notifications` repo; idempotencia
  por `notificationId`.
- [ ] Disparar notificaciones desde `payments.usecases`/`booking.usecases` (confirmación de reserva,
  recordatorio próximo, cancelación) usando el puerto (sin acoplar dominio a Resend/WhatsApp).
- [ ] **Reconectar el servicio ``IA whatsapp``** (refactor del repo legacy) contra el back hexagonal:
  el webhook de Meta verifica el token, encola en **SQS** y responde 200; un consumidor con **Groq**
  interpreta la intención y llama al back (`POST` booking público) generando el **enlace de pago**
  (proveedor real vía back) y enviándolo por chat.
- [ ] Al aprobarse el pago → webhook del back confirma la cita → notificación por WhatsApp (vía SQS/API de Meta) y email (Resend).
- [ ] Despliegue del servicio IA (serverless, stagings dev/prod) + documentar variables/env.
- [ ] Entregable: flujo E2E WhatsApp→reserva→pago→confirmación funcionando en dev; ADR-12.

### I3 — Frontend: cierre de paneles y UX
- [ ] **Owner reports**: consumir capacidad de ingresos/comisión del back (reforzar/integrar overview
  y crear página de reportes con filtro por fechas), conectado a API real (no mock).
- [ ] **Cancelación de citas** con política: botón + diálogo en `mi-historial` (cliente) y lista de
  citas del owner/professional invocando `cancelAppointment`; mostrar política/refund.
- [ ] Completar **i18n es/en** (todas las cadenas de pantallas nuevas; fallback coherente).
- [ ] **Tests unitarios** de front (pipes MoneyPipe/CurrencyPipe, servicios booking/portal, guards de
  roles) con vitest/jsdom; agregar smoke de SSR (todas las rutas públicas 200).
- [ ] Pulido: a11y (contraste/keyboard/focus), SEO meta por tenant, accesibilidad de flujo de reserva
  en <3 pasos visibles, estados de error/carga.
- [ ] Entregable: manual de usuario (es/en) y evidencias (screenshots/vídeo) para la demo.

### I4 — Infraestructura/DevOps
- [ ] **Backups a Cloudflare R2**: Lambda `export-backup-r2` con `mongodump` (Layer) → `.tar.gz` →
  bucket R2 (endpoint S3), EventBridge `cron(0 2 * * ? *)`; probar **restauración** y retención.
- [ ] **CI (GitHub Actions)**: pipeline por repo (Back: `typecheck` + `vitest`; Front: `ng build`;
  WhatsApp IA: tests de seguridad) en cada PR/main.
- [ ] **Secretos**: mover credenciales del `.env` (Mongo, Keycloak admin, pasarela, Resend, Meta,
  R2) a **Secrets Manager**; `.env` solo referencia los ARNs; quitar secretos versionados.
- [ ] **Dominio custom**: ACM (us-east-1) + Route53 + CloudFront alternante del front; restringir
  `NG_ALLOWED_HOSTS` al dominio real; habilitar HTTPS funcional.
- [ ] **Monitoreo**: CloudWatch alarms (errores 5xx, duración/errores de Lambda, mensajes SQS
  visibles), dashboard y policy de alertas; logs estructurados en ambos servicios.
- [ ] Entregable: runbook de operaciones (deploy, rollback, respaldos, credenciales, debugging) y ADR-13.

### I5 — Documentación + QA global
- [ ] **Matriz de trazabilidad** RF/RN/RNF ↔ módulos ↔ pruebas ↔ evidencia (screenshots, respuestas
  de API, logs) en una sola hoja; detectar requisitos sin cubrir y elevarlos.
- [ ] **SRS final consolidado** en `Docs/` (exportar a markdown/PDF) + actas de modificación al día
  (incluir lo de Identidad y Registro ya aprobado) + verificación de consistencia con lo implementado.
- [ ] **ADRs nuevos**: registrar decisiones tomadas en el cierre (pasarela, expiración, WhatsApp IA,
  backups R2, dominio, CI). Hoy están ADR-1..9.
- [ ] **Diagramas draw.io/mermaid finales**: despliegue AWS completo (CloudFront/S3/Lambda/API GW/
  Keycloak/Atlas/R2/EventBridge), modelo de datos Mongo (colecciones + índices), casos de uso, y
  secuencias de pago (hecho), expiración y notificación.
- [ ] **Plan y ejecución de pruebas**: plan de pruebas unitarias/integración/E2E + reporte de
  resultados (matriz de estados) con las evidencias del equipo.
- [ ] **Acta de cierre + presentación**: slides, demo grabada (4 flujos + WhatsApp), métricas de
  calidad (cobertura, tiempo de respuesta típico, 32+ tests), lecciones y riesgos.

---

## 4. Cronograma (6 semanas)

| Semana | I1 | I2 | I3 | I4 | I5 |
| ------ | -- | -- | -- | -- | -- |
| **1–2** | Seam de proveedores + adapter Wompi/PayU (sandbox) + tests | Reconectar IA WhatsApp al back + SQS/Meta/Groq | Reports owner + cancelación UI + i18n | CI GitHub Actions + secretos → Secrets Manager | ADRs 10–14 + actualizar ARQUITECTURA_HEXAGONAL + diagrama despliegue/casos de uso |
| **3–4** | Scheduler expiración (RNF-21) + test concurrencia + rol ledger append-only | Resend adapter + notificaciones + E2E WhatsApp prod | Tests unitarios front + SSR smoke + a11y/SEO | Backups R2 + EventBridge + prueba restauración + dominio custom | Plan de pruebas + ejecución + matriz trazabilidad + SRS consolidado |
| **5–6** | QA/hardening pagos, limpieza datos demo, typecheck final | Integral WhatsApp→pago→confirmación, errores/logs | Pulido final, evidencias (screenshots/vídeo front) | Runbook operativo final, acta despliegue, limpieza de recursos | Diagramas finales, demo + slides, acta de cierre, consolidación del repo |

**Dependencias**: I3 requiere (para reports/cancelación) los endpoints del back (ya existen para
cancelar; reports del back se refuerzan en Sem 1–2). I2 depende de I1 para enlace de pago real
(sandbox). I5 depende de los resultados de pruebas de todos. La **demo final** junta todo en Sem 6.

---

## 5. Documentos a producir (checklist de cierre)

- [ ] `Docs/SRS_RESERvAYA.md/pdf` consolidado + acta de modificación al día.
- [ ] `Docs/ADRs.md` extendido (10–14).
- [ ] `Docs/ARQUITECTURA_HEXAGONAL.md` actualizado (pagos, notif, WhatsApp, backups).
- [ ] Diagramas: despliegue AWS, modelo de datos Mongo, casos de uso, secuencias (pago/expiración/notificación).
- [ ] `Docs/PLAN_PRUEBAS.md` + reporte de resultados + matriz de trazabilidad RF/RN/RNF.
- [ ] `Docs/MANUAL_USUARIO.md` (es/en).
- [ ] `Docs/RUNBOOK_OPERACIONES.md` (deploy, rollback, credenciales, respaldos, monitoreo).
- [ ] `README.md` raíz del repositorio con índice de todo el repo + enlaces a los entregables.
- [ ] Acta de cierre + presentación/slides + demo grabada.
- [ ] Atribuciones/licencias y limpieza de secretos en el historial si se requiere.

---

## 6. Definición de "done" y riesgos

- **Done técnico**: pipeline verde, pruebas unitarias+integración OK, flujos E2E demostrables en prod
  (invitado, owner, profesional, cliente, admin y WhatsApp), sin secretos en el repo.
- **Riesgos**: credenciales de pasarela/sandbox (gestionar temprano); complejidad del WhatsApp legacy
  (acotar a intención+reserva+link de pago, sin migrar todo); rotación de la demo (limpiar datos de
  prueba antes de la demo final); tiempos de Keycloak/Atlas (persistir URLs y credenciales en el runbook).