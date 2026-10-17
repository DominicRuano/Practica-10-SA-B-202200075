import type { Request, Response, NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const service = process.env.OTEL_SERVICE_NAME ?? 'solicitudes';
export const registry = new Registry();
registry.setDefaultLabels({service});
collectDefaultMetrics({register: registry});
const requests = new Counter({name: 'http_requests_total', help: 'Peticiones HTTP atendidas', labelNames: ['method', 'route', 'status'], registers: [registry]});
const latency = new Histogram({name: 'http_request_duration_seconds', help: 'Duracion HTTP en segundos', labelNames: ['method', 'route'], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5], registers: [registry]});
const created = new Counter({name: 'solicitudes_creadas_total', help: 'Solicitudes academicas creadas', registers: [registry]});
const rejected = new Counter({name: 'solicitudes_rechazadas_total', help: 'Intentos de crear solicitudes que no se completaron', registers: [registry]});
const logger = logs.getLogger('http');
const ignored = new Set(['/metrics', '/live', '/ready', '/startup', '/health']);

export function observe(request: Request, response: Response, next: NextFunction): void {
  if (ignored.has(request.path) || request.path.endsWith('/health')) {
    next();
    return;
  }
  const started = performance.now();
  const path = new URL(request.originalUrl, 'http://localhost').pathname;
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (spanContext) response.setHeader('x-trace-id', spanContext.traceId);
  response.once('finish', () => {
    const route = path.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id');
    const duration = (performance.now() - started) / 1000;
    requests.inc({method: request.method, route, status: response.statusCode});
    latency.observe({method: request.method, route}, duration);
    if (service === 'solicitudes' && request.method === 'POST' && path === '/api/v1/solicitudes') {
      if (response.statusCode === 201) created.inc();
      else rejected.inc();
    }
    const record = {timestamp: new Date().toISOString(), service, level: response.statusCode >= 500 ? 'ERROR' : 'INFO', event: 'http_request', trace_id: spanContext?.traceId, span_id: spanContext?.spanId, method: request.method, route, status: response.statusCode, duration_seconds: duration};
    const body = JSON.stringify(record);
    process.stdout.write(body + '\n');
    logger.emit({body, severityNumber: response.statusCode >= 500 ? SeverityNumber.ERROR : SeverityNumber.INFO, attributes: {service, route, status: response.statusCode}});
  });
  next();
}

export async function metrics(_request: Request, response: Response): Promise<void> {
  response.type(registry.contentType).send(await registry.metrics());
}
