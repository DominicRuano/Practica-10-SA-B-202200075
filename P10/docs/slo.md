# Objetivos de servicio

Se mide la experiencia en el gateway del ecosistema académico. Las sondas de
salud y el endpoint de métricas se excluyen de las series HTTP. Los identificadores
individuales de solicitudes se normalizan para evitar cardinalidad ilimitada.

| Objetivo | Indicador | Meta | Ventana |
|---|---|---|---|
| Disponibilidad | Fracción de peticiones que no terminan en HTTP 5xx | 99 % | 24 horas |
| Latencia | Fracción de peticiones completadas en 500 ms o menos | 95 % | 24 horas |

La disponibilidad permite un 1 % de respuestas 5xx; los errores 4xx de entrada
inválida o sesión ausente no se consideran indisponibilidad del servidor. La meta
reconoce que el entorno académico tiene un único clúster zonal. La latencia deja
un 5 % de operaciones fuera de 500 ms para consultas y operaciones ocasionalmente
más costosas, pero exige que el uso habitual de la plataforma sea interactivo.
Ambos objetivos se declaran antes de inducir el fallo.

El presupuesto consumido se calcula como `(1 - SLI) / (1 - objetivo)`. Un valor
1 significa que se agotó el presupuesto de la ventana. El burn rate compara la
fracción de fallos reciente con la fracción tolerada. Las reglas usan ventanas
simultáneas de 1 y 5 minutos y exigen al menos 20 peticiones en el minuto reciente.
La alerta de disponibilidad requiere un consumo de 14.4 veces lo tolerado; la de
latencia requiere 2 veces y se comunica como advertencia para investigar la
regresión de rendimiento. Ambas deben persistir 15 segundos.

Estas ventanas cortas permiten comprobar el funcionamiento durante una práctica;
no representan una política universal de guardias de producción. Una instalación
reciente calcula sobre el tramo que realmente tiene datos: no demuestra haber
cumplido 24 horas. Prometheus conserva 24 horas de muestras y los indicadores no
se presentan como un historial completo hasta cubrir esa ventana.

Las consultas exactas se mantienen en
`gitops/observability/templates/metrics.yaml`. El canary compara exclusivamente
la etiqueta `pod_template_hash` de la versión candidata: exige tráfico medido,
como mínimo cinco peticiones en el último minuto, error HTTP 5xx no superior a
1 % y p95 no superior a 500 ms. La ausencia de tráfico no permite promover.
