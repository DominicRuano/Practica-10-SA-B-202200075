# Práctica 10: observabilidad y operación

**Carnet: 202200075.** La plataforma incorpora métricas, trazas distribuidas y
registros correlacionados para investigar fallos y decidir promociones mediante
mediciones de la versión candidata. Reutiliza el clúster y los servicios de P9.

## Datos de la entrega

| Dato | Valor o enlace |
|---|---|
| Código | [Repositorio público de P10](https://github.com/DominicRuano/Practica-10-SA-B-202200075) |
| GitOps | [Manifiestos públicos](https://github.com/DominicRuano/Practicas-SA-B-202200075-gitops) |
| Servicios instrumentados | `gateway`, `solicitudes`, `catalogo`; namespace `sa-p9` |
| Stack | Namespace `observabilidad`; aplicaciones `p10-monitoring` y `p10-observability` |
| Prometheus | Servicio `p10-monitoring-prometheus`, puerto `9090` |
| Rollout | `catalogo`, namespace `sa-p9` |
| AnalysisTemplate | `catalogo-promotion`; `templates/analysis-template.yaml` dentro del [chart de catálogo](https://github.com/DominicRuano/Practicas-SA-B-202200075-gitops/blob/main/p9/platform/charts/catalogo-0.9.0.tgz); [manifiestos desplegados](docs/evidencias/analysistemplates.json) |
| PromQL | [Consultas](docs/consultas.md) y [análisis de la candidata](https://github.com/DominicRuano/Practicas-SA-B-202200075-gitops/blob/main/p9/platform/charts/catalogo-0.9.0.tgz) |
| SLO de disponibilidad | 99 % de peticiones sin HTTP 5xx, ventana de 24 horas |
| SLO de latencia | 95 % de peticiones en 500 ms o menos, ventana de 24 horas |
| Reglas SLI y presupuesto | `p10-slo`; [PrometheusRule](gitops/observability/templates/metrics.yaml) |
| Métricas de negocio | `solicitudes_creadas_total`, `solicitudes_rechazadas_total`, `consultas_catalogo_total` |
| SLI declarado en p10.conf | `p10:sli_availability:ratio24h` |
| Tablero | [JSON de Grafana](dashboards/operacion.json), UID `p10-operacion`; [captura](docs/evidencias/tablero-fallo.png) |
| Reversión y AnalysisRun | `catalogo-b598b97bb-5-2`, Rollout `catalogo`; [AnalysisRun fallido](docs/evidencias/analysisrun-latencia-fallido.json) |
| Recorrido y tiempo | **4.999 s** para el diagnóstico completo por API; [medición original](docs/evidencias/recorrido-sintoma-causa.json) y [cálculo del tiempo completo](docs/evidencias/tiempos-calculados.json) |
| Video y minutajes | [Demostración](docs/evidencias/demostracion.webm) y [guía del video](docs/video.md) |

## Herramientas y flujo

OpenTelemetry instrumenta los tres servicios y propaga `traceparent` entre
gateway, solicitudes y catálogo. El Collector recibe trazas y registros por
OTLP: Tempo guarda las trazas y Loki los registros JSON con `trace_id`.
Prometheus obtiene métricas desde `/metrics`; sus reglas calculan los SLI,
presupuestos y alertas que agrupa Alertmanager. Grafana reúne las tres fuentes y
permite navegar entre una traza y sus registros.

Argo CD instala y mantiene el stack desde Git. Argo Rollouts consulta Prometheus
por el hash de la candidata: exige tráfico suficiente, errores de hasta 1 % y
p95 de hasta 500 ms. La prueba induce una demora de 2500 ms en catálogo para
observar la alerta y la reversión automática. El cliente HTTP de prueba genera
operaciones autenticadas; la decisión del análisis depende de Prometheus.

Las imágenes se publican con firmas Cosign y SBOM. Kyverno verifica las firmas
de P10 y conserva las políticas de admisión anteriores. External Secrets,
persistencia, réplicas y respaldos de Velero siguen bajo la configuración de P9.

## Ejecución

La práctica requiere el clúster `sa-p9` y la raíz GitOps de P9. El repositorio
público contiene exclusivamente la entrega de P10; los charts y el estado
deseado de la plataforma se encuentran en el repositorio GitOps enlazado.

```bash
bash P10/scripts/verify.sh
bash P10/bootstrap.sh
bash P10/scripts/access.sh
bash verificar_p10.sh
```

Usar [p10.conf](p10.conf) desde la raíz del repositorio. El
[procedimiento de ejecución](docs/ejecucion.md) explica contexto, requisitos,
tráfico, fallo, recuperación y ejecución posterior del verificador de P9.

Los verificadores del auxiliar se ejecutan intactos. Los reportes de
[evidencias](docs/evidencias/) conservan sus resultados; las diferencias entre
el script y los recursos deben revisarse con el auxiliar. La calificación final
incluye la evaluación presencial.

## Documentación

- [Arquitectura y flujo de telemetría](docs/telemetria.md) y [diagrama](docs/arquitectura.svg).
- [Objetivos, indicadores y presupuesto de error](docs/slo.md).
- [Runbooks de disponibilidad y latencia](docs/runbooks.md).
- [Consultas para diagnóstico](docs/consultas.md).
- [Informe de operación](docs/informe-operacion.pdf), PDF de dos páginas; [versión de texto](docs/informe-operacion.md).
- [Preguntas teóricas](docs/preguntas.md).

Los datos recientes representan únicamente el período observado desde la
instalación. La ventana configurada de 24 horas requiere ese historial para
evaluar su cumplimiento completo.

## Video demostrativo

[Video público, 6 min 29 s](https://github.com/DominicRuano/Practica-10-SA-B-202200075/raw/refs/heads/main/P10/docs/evidencias/demostracion.webm). Demostración con subtítulos y sin audio.

| Inicio | Punto demostrado |
|---|---|
| 00:00 | Arquitectura y objetivos |
| 00:38 | Cuatro señales, negocio y presupuesto |
| 01:41 | GitOps y rechazo automático |
| 02:26 | Alerta de presupuesto |
| 03:00 | Tempo: localizar el span lento |
| 04:03 | Loki: registro y causa correlacionados |
| 05:09 | Recuperación y continuidad de P9 |
