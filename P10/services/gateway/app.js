import express from 'express';
import helmet from 'helmet';
import {observe, metrics} from './http.js';

const destinations = {
  auth: process.env.AUTH_URL || 'http://autenticacion:3000',
  solicitudes: process.env.SOLICITUDES_URL || 'http://solicitudes:3001',
  catalogo: process.env.CATALOGO_URL || 'http://catalogo:8000',
  reportes: process.env.REPORTES_URL || 'http://reportes:8001',
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(observe);
  app.get('/metrics', metrics);
  for (const path of ['/live', '/ready', '/startup']) {
    app.get(path, (_request, response) => response.json({status: 'ok', servicio: 'gateway'}));
  }
  app.get('/health', (_request, response) => response.json({data: {status: 'ok', servicio: 'gateway'}}));
  app.use(express.raw({type: () => true, limit: '1mb'}));
  app.use(async (request, response) => {
    const match = /^\/api\/v1\/(auth|solicitudes|catalogo|reportes)(?:\/|$)/.exec(request.path);
    if (!match) return response.status(404).json({error: {code: 'NOT_FOUND', message: 'La ruta solicitada no existe.'}});
    const service = match[1];
    const headers = new Headers();
    for (const name of ['content-type', 'cookie', 'origin', 'traceparent', 'tracestate', 'baggage']) {
      const value = request.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('accept-encoding', 'identity');
    headers.set('connection', 'close');
    try {
      if (service !== 'auth' && !request.path.endsWith('/health')) {
        const session = await fetch(`${destinations.auth}/internal/verify`, {headers: {cookie: request.get('cookie') || '', connection: 'close'}, signal: AbortSignal.timeout(5000)});
        if (!session.ok) {
          const status = session.status === 403 ? 403 : session.status >= 500 ? 503 : 401;
          return response.status(status).json({error: {code: status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'AUTH_UNAVAILABLE', message: 'No se pudo validar la sesion.'}});
        }
        const user = session.headers.get('x-user-id');
        const role = session.headers.get('x-user-role');
        if (!user || !role) return response.status(502).json({error: {code: 'AUTH_INVALID_RESPONSE'}});
        headers.set('x-user-id', user);
        headers.set('x-user-role', role);
      }
      const upstream = await fetch(`${destinations[service]}${request.originalUrl}`, {
        method: request.method, headers, redirect: 'manual',
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        signal: AbortSignal.timeout(10000),
      });
      response.status(upstream.status);
      for (const name of ['content-type', 'location', 'cache-control']) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) response.setHeader('set-cookie', cookies);
      return response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      return response.status(502).json({error: {code: 'UPSTREAM_UNAVAILABLE', message: 'Servicio temporalmente no disponible.'}});
    }
  });
  return app;
}
