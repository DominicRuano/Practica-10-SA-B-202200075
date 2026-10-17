# Consultas para la demostración

Abrir los accesos con `bash P10/scripts/access.sh`. Las mismas expresiones pueden
introducirse en Grafana Explore seleccionando el origen correspondiente.

| Pregunta | Origen | Consulta |
|---|---|---|
| ¿Cuántas solicitudes se crearon? | Prometheus | `sum(solicitudes_creadas_total)` |
| ¿Cuántos intentos fueron rechazados? | Prometheus | `sum(solicitudes_rechazadas_total)` |
| ¿Qué servicio concentra la latencia? | Prometheus | `histogram_quantile(0.95, sum by (le,service) (rate(http_request_duration_seconds_bucket[1m])))` |
| ¿Cuánto presupuesto de latencia se consumió? | Prometheus | `p10:error_budget_latency:consumed24h` |
| ¿Hay consumo acelerado de latencia? | Prometheus | `p10:latency:burnrate1m` |
| ¿Qué trazas de catálogo tardaron más de 2 s? | Tempo | `{ resource.service.name = "catalogo" && duration > 2s }` |
| ¿Qué evento explica la demora? | Loki | `{service_name="catalogo"} | json | event="catalogo_dependency_latency"` |
| ¿Qué registros pertenecen a una traza concreta? | Loki | `{service_name=~"gateway|solicitudes|catalogo"} | json | trace_id="ID_DE_TRAZA"` |

Ejemplo desde la terminal:

```bash
python3 P10/scripts/query.py prometheus 'sum(solicitudes_creadas_total)'
python3 P10/scripts/query.py tempo '{ resource.service.name = "catalogo" && duration > 2s }'
python3 P10/scripts/query.py loki '{service_name="catalogo"} | json | event="catalogo_dependency_latency"'
```

El marcador `ID_DE_TRAZA` se sustituye por el identificador obtenido en Tempo;
no se reutiliza un ejemplo inventado. Para evaluar el canary, usar el hash de su
ReplicaSet en lugar de agregar todas las versiones. Las expresiones exactas de
promoción están en los AnalysisTemplates de GitOps y sus resultados se conservan
en el AnalysisRun de la prueba.

## Consultas que deciden la promoción

Argo Rollouts sustituye `args.service` y `args.hash` por el servicio y el hash
de la candidata. Estas son las expresiones de los AnalysisTemplates desplegados;
su exportación está en [analysistemplates.json](evidencias/analysistemplates.json).

Tráfico: al menos cinco peticiones observadas durante el último minuto.

```promql
sum(increase(http_requests_total{service="{{args.service}}",pod_template_hash="{{args.hash}}"}[1m])) or vector(0)
```

Errores HTTP 5xx: proporción no superior a `0.01`.

```promql
(sum(rate(http_requests_total{service="{{args.service}}",pod_template_hash="{{args.hash}}",status=~"5.."}[1m])) or vector(0)) /
clamp_min(sum(rate(http_requests_total{service="{{args.service}}",pod_template_hash="{{args.hash}}"}[1m])), 0.000001)
```

Latencia p95: resultado finito no superior a `0.5` segundos.

```promql
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="{{args.service}}",pod_template_hash="{{args.hash}}"}[1m])))
```

Cada métrica se evalúa tres veces a intervalos de diez segundos, con
`failureLimit: 1`. Dos mediciones fallidas abortan el análisis. Las tres métricas
deben resultar satisfactorias; una candidata sin tráfico no puede aprobar.
