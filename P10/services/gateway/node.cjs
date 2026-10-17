const { NodeSDK } = require('@opentelemetry/sdk-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

const ignored = new Set(['/live', '/ready', '/startup', '/health', '/metrics']);
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME,
    'service.version': process.env.SERVICE_VERSION || '1.10.0',
    'deployment.environment.name': 'laboratorio',
  }),
  traceExporter: new OTLPTraceExporter(),
  logRecordProcessors: [new BatchLogRecordProcessor({exporter: new OTLPLogExporter()})],
  instrumentations: [
    new HttpInstrumentation({ignoreIncomingRequestHook: request => ignored.has(request.url)}),
    new UndiciInstrumentation(),
  ],
});
sdk.start();
process.once('SIGTERM', () => sdk.shutdown().catch(error => console.error(error.message)));
