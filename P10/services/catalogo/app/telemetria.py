import asyncio
import json
import logging
import os
import time

from fastapi import Request, Response
from opentelemetry import trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest


requests = Counter('http_requests_total', 'Peticiones HTTP atendidas', ['service', 'method', 'route', 'status'])
latency = Histogram('http_request_duration_seconds', 'Duracion HTTP en segundos', ['service', 'method', 'route'], buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5])
consultas = Counter('consultas_catalogo_total', 'Consultas recibidas por el catalogo academico')
resource = Resource.create({'service.name': 'catalogo', 'service.version': os.getenv('SERVICE_VERSION', '1.10.1')})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)
log_provider = LoggerProvider(resource=resource)
log_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
set_logger_provider(log_provider)
logger = logging.getLogger('p10.http')
logger.setLevel(logging.INFO)
logger.addHandler(LoggingHandler(logger_provider=log_provider))
logger.propagate = False


def instrumentar(app):
    @app.get('/metrics', include_in_schema=False)
    async def metrics():
        return Response(generate_latest(), headers={'Content-Type': CONTENT_TYPE_LATEST})

    @app.middleware('http')
    async def observar(request: Request, call_next):
        route = request.url.path
        if route in {'/metrics', '/live', '/ready', '/startup'} or route.endswith('/health'):
            return await call_next(request)
        started = time.perf_counter()
        context = trace.get_current_span().get_span_context()
        delay = int(os.getenv('FAULT_DELAY_MS', '0'))
        if delay and route == '/api/v1/catalogo/graphql':
            record = {'service': 'catalogo', 'level': 'ERROR', 'event': 'catalogo_dependency_latency', 'trace_id': f'{context.trace_id:032x}', 'span_id': f'{context.span_id:016x}', 'delay_ms': delay, 'cause': 'latencia_inducida_dependencia_catalogo'}
            body = json.dumps(record)
            print(body, flush=True)
            logger.error(body)
            trace.get_current_span().add_event('catalogo_dependency_latency', {'delay_ms': delay})
            await asyncio.sleep(delay / 1000)
        response = await call_next(request)
        duration = time.perf_counter() - started
        requests.labels('catalogo', request.method, route, response.status_code).inc()
        latency.labels('catalogo', request.method, route).observe(duration)
        if route == '/api/v1/catalogo/graphql':
            consultas.inc()
        record = {'service': 'catalogo', 'level': 'INFO', 'event': 'http_request', 'trace_id': f'{context.trace_id:032x}', 'span_id': f'{context.span_id:016x}', 'route': route, 'method': request.method, 'status': response.status_code, 'duration_seconds': duration}
        body = json.dumps(record)
        print(body, flush=True)
        logger.info(body)
        response.headers['x-trace-id'] = f'{context.trace_id:032x}'
        return response

    FastAPIInstrumentor.instrument_app(app, excluded_urls='metrics,live,ready,startup,health')
