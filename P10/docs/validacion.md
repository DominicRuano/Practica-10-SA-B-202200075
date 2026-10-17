# Validación de la entrega

Se ejecutaron los verificadores originales del auxiliar en GKE `sa-p9`, primero
P10 y después P9. Los archivos conservan los hashes registrados en
[verificadores.sha256](evidencias/verificadores.sha256).

| Verificador original | Resultado | Eliminatorio informado |
|---|---|---|
| P10 | 45/60 | `analisis-sin-prometheus` |
| P9 | 45/60 | `sin-respaldo` |

Los [reportes y CSV originales](evidencias/verificadores-originales/) conservan
esos resultados. La calificación final requiere revisión del auxiliar; estos
resultados no equivalen a 60/60 ni eliminan la evaluación presencial.

## Diferencias entre el script y los recursos

En Bash, expresiones como `"${ATJSON:-{}}"` añaden una llave final al contenido
de una variable no vacía. El JSON válido termina convertido en JSON inválido y
`jq` devuelve un error. En algunas consultas imprime primero el conteo y después
falla: el `|| echo 0` agrega otro cero y la comparación numérica recibe dos líneas.
Esto explica mensajes como `8 0: integer expression expected` en P10.

- P10: líneas 179–190 y 226–245 del original. La comprobación de runbook también
  procesa anotaciones nulas de las reglas de registro antes de llegar a las
  alertas. Las reglas de registro no necesitan anotaciones de runbook.
- P9: líneas 174, 185, 194–198, 229 y 263 del original. Afecta la detección del
  Schedule, respaldos, destino, volúmenes y restauraciones.

Los originales permanecen sin cambios. El contraste se realiza consultando
directamente los recursos y conservando el resultado, sin recalcular la nota:

| Recurso comprobado | Evidencia |
|---|---|
| Tres AnalysisTemplates con proveedor Prometheus y filtro del hash candidato | [Manifiestos](evidencias/analysistemplates.json) |
| Ocho reglas de registro, dos alertas por burn rate y dos runbooks | [PrometheusRule](evidencias/reglas-slo.json) |
| Rechazo por p95 con tráfico suficiente | [AnalysisRun fallido](evidencias/analysisrun-latencia-fallido.json) |
| Schedule cada 15 minutos, siete días de retención, backups Completed con volúmenes y restore Completed | [Consulta de recursos](evidencias/validacion-recursos.json) |
| Cinco servicios saludables, dos réplicas y diez aplicaciones sincronizadas | [Estado final](evidencias/estado-final.json) |
| Datos y usuario cifrado conservados en P9 | [Datos](evidencias/continuidad-datos-p9.txt), [secretos](evidencias/continuidad-secretos-p9.json) |

## Comprobaciones realizadas

Las validaciones locales de Bash, Helm y manifiestos pasaron, junto con las
pruebas de gateway, solicitudes y catálogo. Una prueba adicional exige recibir
realmente una exportación OTLP de logs, para detectar incompatibilidades del SDK.
El flujo funcional de P9, sus políticas y el control de antigüedad del respaldo
también pasaron sobre el entorno final.

El bootstrap final se ejecutó sobre el entorno ya creado. Se revisaron las
dependencias de reconstrucción y el inventario de volúmenes propios; en esta
validación de P10 no se repitió la destrucción del clúster ni la restauración
destructiva de P9.
