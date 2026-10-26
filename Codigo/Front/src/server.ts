import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Reverse proxy for the ReservaYa backend API.
 *
 * All backend endpoints live under `/api/*` (public directory, onboarding,
 * professional invitations, roles, etc.). In production the Lambda runs with a
 * `BACK_API_URL` env var pointing to the API Gateway; in local dev / mock mode
 * the Angular `ApiService` uses `environment.useMockBackend` and never hits
 * this proxy. If the env var is absent the proxy responds 503 so failures are
 * explicit instead of silently rendering a broken SSR page.
 */
const backApiUrl = process.env['BACK_API_URL'];
app.use('/api', async (req, res, next) => {
  if (!backApiUrl) {
    res.status(503).json({ message: 'BACK_API_URL not configured' });
    return;
  }

  const target = new URL(req.originalUrl, backApiUrl).toString();
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host') continue;
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
  }

  const rawBody = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

  try {
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? new Uint8Array(rawBody) : undefined,
    });
    res.status(upstream.status);
    upstream.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    next();
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
