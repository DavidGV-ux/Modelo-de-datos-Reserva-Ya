# Reflexión del equipo · Primer pipeline de CI

**Proyecto:** ReservaYa · Ingeniería de Software I · UPTC Sogamoso
**Fecha:** 26 de octubre de 2026

## 1. ¿Qué problema concreto evita un pipeline de CI cuando varias personas trabajan sobre el mismo código?

Evita que los cambios de varias ramas se integren solo al final y que los errores aparezcan en la entrega. En ReservaYa el backend tiene reglas críticas de reservas y pagos (`booking-rules.ts`, `payments-rules.ts`) y 64 pruebas unitarias; si una persona cambia una regla y otra modifica su prueba, el check `validar` lo detecta en el PR antes de llegar a `main`. Sin CI, ese choque se descubriría al ejecutar todo manualmente o al probar la aplicación completa, cuando ya es más costoso corregirlo.

## 2. ¿Qué error detectó el check en el Paso 3 y cómo lo habrían descubierto sin automatización?

El PR #3 agregó una prueba que esperaba `2 + 2 = 5`; el job `validar` falló en 22 segundos con `AssertionError: expected 4 to be 5` y GitHub bloqueó el merge. Sin automatización, alguien tendría que recordar ejecutar `npx vitest run test/unit` en su máquina antes de subir el cambio, o el error aparecería en una revisión manual o en la demo del proyecto. La diferencia es que el pipeline no depende de que alguien se acuerde: se ejecuta siempre y deja el log adjunto al PR.

## 3. ¿A qué escenario de calidad de la Semana 6 (por ejemplo, mantenibilidad o confiabilidad) ayuda este pipeline y por qué?

Ayuda principalmente a la **confiabilidad**, porque cada cambio en las reglas de reservas, cancelaciones y pagos se compila y se prueba antes de fusionarse. También mejora la **mantenibilidad**: el proyecto debe seguir compilando con TypeScript y las pruebas unitarias deben seguir pasando, y el README documenta los comandos para reproducir el CI. En la práctica, `npm run build` detecta errores de tipos en el dominio y `vitest` protege cálculos como el anticipo de una reserva (`computeAdvance`), que son difíciles de revisar a simple vista.

## 4. ¿Qué no valida hoy su pipeline? Mencionen al menos dos cosas.

No valida las **pruebas de integración** que necesitan MongoDB (`test/integration/booking.test.ts`, `concurrency.test.ts`, etc.); esas pruebas tienen aserciones desactualizadas y hoy se excluyen para no bloquear el primer pipeline, así que no se cubren transacciones, repositorios ni concurrencia real. Tampoco valida el **frontend Angular** (`Codigo/Front`): no se ejecuta `ng build` ni sus pruebas, por lo que un error de plantilla o de rutas no lo detectaría este workflow. Además, no hace análisis de seguridad de dependencias (`npm audit`), análisis estático con ESLint ni despliegue; todo eso queda como trabajo futuro.

## 5. ¿Qué agregarían primero: pruebas automatizadas, análisis de código o despliegue automático? Justifiquen la elección.

Agregaríamos primero **pruebas automatizadas**, empezando por levantar un MongoDB de servicio en el workflow y reactivar las pruebas de integración, y después sumar `ng build` y pruebas del frontend. La razón es que el despliegue automático sin una suite confiable solo aceleraría la publicación de errores; el análisis de código es valioso, pero no reemplaza probar el comportamiento real de reservas y pagos. Con la suite completa en verde, sí tendría sentido agregar ESLint/CodeQL y luego un despliegue automático a un entorno de staging.

---

### Evidencia del flujo rojo → verde

- PR con el error intencional: <https://github.com/DavidGV-ux/Modelo-de-datos-Reserva-Ya/pull/3>
- PR con la corrección en verde: <https://github.com/DavidGV-ux/Modelo-de-datos-Reserva-Ya/pull/4>
- Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
