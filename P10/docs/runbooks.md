# Atención de alertas

## Disponibilidad

**Alerta:** `P10AvailabilityBudgetBurn`.

La proporción de respuestas 5xx supera el presupuesto permitido en las dos
ventanas. Requiere intervención porque los usuarios no están completando sus
operaciones y el fallo persiste más allá de un pico aislado.

1. Abrir el tablero `p10-operacion` y localizar el servicio con aumento de errores.
2. Revisar el Rollout y su AnalysisRun. Si la regresión corresponde a la candidata,
   comprobar que Argo Rollouts la abortó; no promover una candidata fallida.
3. En Tempo, buscar trazas recientes con error del servicio afectado. Abrir la traza
   y seleccionar el span responsable.
4. Seguir el enlace de la traza a Loki. Filtrar el mismo `trace_id`, revisar el
   evento y contrastar la causa con la configuración y los recursos del servicio.
5. Revertir el cambio causante mediante GitOps. Confirmar recuperación HTTP,
   desaparición del consumo acelerado y continuidad de los respaldos de P9.

No reiniciar bases ni borrar volúmenes para resolver una regresión de aplicación.

## Latencia

**Alerta:** `P10LatencyBudgetBurn`.

Las peticiones lentas consumen el presupuesto al menos dos veces más rápido que
lo tolerado en ambas ventanas. Es una advertencia accionable: revisar la regresión
antes de que se prolongue, aunque aún no haya respuestas 5xx.

1. Abrir el panel de latencia p95 y el consumo de presupuesto del gateway.
2. En Tempo, buscar el servicio `catalogo` y las trazas del período de la alerta.
   Examinar el span lento y copiar su identificador de traza.
3. En Loki, ejecutar `{service_name="catalogo"} | json | trace_id="ID"`.
4. Si aparece `catalogo_dependency_latency`, revisar `delay_ms` y la versión del
   pod. En la prueba controlada la causa es `FAULT_DELAY_MS=2500` en la candidata;
   en operación debe investigarse la dependencia real antes de atribuir la causa.
5. Comprobar el AnalysisRun y la reversión automática. Publicar por GitOps el valor
   estable `FAULT_DELAY_MS=0`, esperar el Rollout Healthy y confirmar p95 normal.
6. Verificar que P9 conserva backups Completed, destino Available y servicios
   saludables. Registrar las horas reales de detección y recuperación.

Las dos alertas incluyen `runbook_url`. Alertmanager permite consultarlas y
agruparlas; la configuración de laboratorio no envía correo ni mensajes externos.
