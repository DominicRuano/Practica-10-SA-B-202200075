# Preguntas de operación

**¿Qué diferencia existe entre una métrica, una traza y un registro?**
La métrica muestra una tendencia agregada; la traza reconstruye una petición
entre servicios; el registro describe el evento concreto dentro de ese recorrido.
El mismo trace ID permite pasar de una traza al detalle del evento en Loki.

**¿Por qué usar p95 en vez del promedio?**
El promedio puede ocultar que parte de los usuarios recibe respuestas lentas.
El p95 establece el tiempo bajo el cual se completó el 95 % de las observaciones.
Se calcula desde los buckets del histograma, no promediando percentiles de pods.

**¿Qué impide aprobar un canary sin tráfico?**
El análisis exige una cantidad mínima de peticiones observadas. Las consultas
filtran el hash de la candidata y verifican errores y p95. Una serie vacía o un
percentil NaN no constituye evidencia suficiente para promover.

**¿Qué distingue SLI, SLO y presupuesto de error?**
El SLI es el indicador medido. El SLO es su meta dentro de una ventana. El
presupuesto representa la fracción de fallos tolerada; su consumo indica cuánto
de ese margen ya se utilizó. Un burn rate compara el consumo reciente con el
ritmo permitido por el objetivo.

**¿Por qué una alerta no depende únicamente del uso de CPU?**
Una CPU ocupada puede estar atendiendo tráfico correctamente. Las alertas de P10
requieren degradación que afecta al usuario, persistente en dos ventanas y con
tráfico suficiente. El tablero usa saturación para investigar causas, no para
convertir cada variación de recursos en una interrupción humana.

**¿Qué límites tiene esta instrumentación?**
El muestreo completo es adecuado para el tráfico de laboratorio, pero exige
revisar volumen y retención antes de aumentar la carga. Una instalación reciente
no aporta una ventana histórica completa. Las métricas de disponibilidad HTTP
no detectan por sí solas respuestas 200 semánticamente incorrectas de GraphQL;
las trazas y los eventos de negocio complementan ese indicador. La demostración
induce latencia en catálogo y no sustituye pruebas de todas las dependencias.

**¿Cómo se conserva P9?**
Se mantienen el namespace, las bases, las identidades, los secretos, los PVC y el
Schedule de Velero. Los servicios HTTP conservan al menos dos réplicas declaradas,
probes y PDB. Después de la demostración se restaura el valor estable por GitOps
y se ejecuta el verificador original de P9, además de consultar directamente el
respaldo y la restauración. La puntuación del script se registra sin alterarla.
