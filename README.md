![CI](https://github.com/DavidGV-ux/Modelo-de-datos-Reserva-Ya/actions/workflows/ci.yml/badge.svg)

# ReservaYa · Modelo de datos

Proyecto de Ingeniería de Software I (UPTC Sogamoso). ReservaYa es una plataforma de reservas para negocios de servicios (barberías, spas, consultorios) con backend hexagonal en TypeScript, frontend Angular y servicios de WhatsApp.

## Estructura

- `Codigo/Back`: API y lógica de dominio en Node.js + TypeScript (MongoDB, Keycloak, Wompi/PayU).
- `Codigo/Front`: aplicación Angular con SSR.
- `Codigo/ReservaYa-Whatsapp`: servicio de webhook de WhatsApp.
- `docs`: documentación del proyecto.

## Integración continua

El workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) se ejecuta en cada push a `main` y en cada Pull Request. El job `validar`:

1. Instala dependencias con `npm ci`.
2. Compila y verifica tipos con `npm run build`.
3. Ejecuta las pruebas unitarias con `vitest run test/unit`.

Para reproducirlo localmente:

```bash
cd Codigo/Back
npm ci
npm run build
npx vitest run test/unit
```
