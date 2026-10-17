# Ejecución y recuperación de la demostración

## Preparación

La práctica amplía el clúster existente de P8/P9; no crea otro clúster. Se requieren
Git, Bash, Python con PyYAML, Helm, kubectl, gcloud, Node.js, Cosign y acceso al
repositorio GitOps. La construcción de imágenes usa Docker. Para validar los
servicios localmente se ejecutan las pruebas incluidas en sus directorios.

Desde la raíz del repositorio, obtener el contexto correcto:

```bash
mkdir -p P10/.runtime
export KUBECONFIG="$PWD/P10/.runtime/kubeconfig"
gcloud container clusters get-credentials sa-p9 --zone us-central1-a --project elated-pathway-341621
kubectl config current-context
cp P10/p10.conf p10.conf
```

En el espacio de trabajo que contiene P9 también se puede reutilizar su archivo:

```bash
export KUBECONFIG="$PWD/P9/.runtime/kubeconfig"
export PATH="$PWD/P9/.runtime/bin:$PATH"
```

La identidad debe corresponder al proyecto y clúster indicados. No ejecutar las
pruebas con el contexto de P8. `bash P10/scripts/verify.sh` valida los manifiestos
localmente; si P9 no está en el repositorio, descarga su chart desde GitOps.

## Instalación por GitOps

Las aplicaciones `p10-monitoring` y `p10-observability` son hijas de `sa-p9-root`.
La plataforma `p9-platform` incorpora `p10/platform-values.yaml` como segundo
archivo de valores. Los manifiestos del repositorio GitOps son la fuente del
estado deseado; no instalar el stack con un `helm install` paralelo.

`bash P10/bootstrap.sh` comprueba el contexto y las firmas, prepara el secreto de
administración de Grafana, inicia un cliente de tráfico si no existe uno activo y
espera aplicaciones y Rollouts estables. La contraseña
queda en `P10/.private/grafana-password`, excluida de Git. En una reconstrucción,
conservar ese archivo o generar una credencial nueva para la interfaz de Grafana;
no reutilizar las llaves de cifrado de las bases como contraseña del tablero.

Cuando se usa el repositorio que incluye P9, `P9/bootstrap.sh apply [respaldo]`
prepara el secreto de Grafana antes de crear la raíz de Argo CD y luego invoca
el bootstrap de P10. Al salir del mantenimiento de una restauración se vuelve
a preparar el tráfico sobre los datos recuperados. Así, la raíz no espera un
canary sin peticiones ni un secreto que todavía no existe.

Las bases y sus credenciales conservan la recuperación de P9. Los controladores
y servicios de observabilidad se reconstruyen desde GitOps; el historial de
telemetría de 24 horas se vuelve a generar. Los cuatro PVC de observabilidad
pertenecen a P10. La retirada de P9 identifica esos nombres exactos además de
sus propios volúmenes; no incluye volúmenes de otras prácticas o namespaces.

El análisis usa solo Prometheus y exige tráfico real de la candidata. Para la
transición inicial desde las imágenes de P9 sin instrumentación, el cliente de
prueba dirige peticiones al servicio preview `gateway-canary`. El CronJob
`p10-traffic-client` permanece suspendido; solo se crean ejecuciones manuales:

```bash
kubectl create job p10-trafico --from=cronjob/p10-traffic-client -n sa-p9
```

Este Job genera operaciones HTTP autenticadas. No es el proveedor de análisis y
no decide la promoción. Renueva su sesión y no depende del túnel de la computadora.
Al terminar la demostración se elimina únicamente el Job de prueba creado.

## Acceso a las herramientas

```bash
bash P10/scripts/access.sh
```

Grafana: `http://127.0.0.1:3000/d/p10-operacion`. Prometheus: puerto 9090.
Alertmanager: puerto 9093. Tempo: puerto 3200. Loki: puerto 3100.
Las consultas de ejemplo están en `consultas.md`.

## Fallo y reversión

La candidata de catálogo permanece cuatro minutos al 50 % antes del análisis.
Ese período permite observar las ventanas de alerta y recolectar muestras de
latencia. Los umbrales y la decisión automática permanecen iguales.

Con tráfico activo y la plataforma estable:

```bash
bash P10/scripts/canary.sh /ruta/al/checkout-gitops failure
kubectl get rollout catalogo -n sa-p9 -w
```

El cambio establece `FAULT_DELAY_MS=2500` en catálogo. Las sondas continúan
funcionando y las operaciones GraphQL reciben demora; el fallo se distingue del
rechazo de readiness de P8. En otra terminal, iniciar `python3 P10/scripts/measure-incident.py` antes de
publicar el fallo; requiere la alerta de latencia inicialmente inactiva. Mide por
API el recorrido entre la alerta y la traza con su registro correlacionado, y
conserva el primer evento del fallo para calcular la detección.

El AnalysisRun debe fallar por el p95 de la candidata,
con peticiones medidas. Argo Rollouts devuelve el tráfico a la versión estable.
Después, publicar la configuración estable:

```bash
bash P10/scripts/canary.sh /ruta/al/checkout-gitops restore
```

No forzar una promoción, borrar el AnalysisRun fallido ni reducir el umbral para
conseguir una puntuación. Conservar el estado y las mediciones del incidente.

## Calificación

Preparar `p10.conf` y ejecutar directamente el archivo del auxiliar:

```bash
bash verificar_p10.sh
```

Después ejecutar el original de P9 desde su repositorio, con `p9.conf` y las
herramientas de Velero disponibles. El auxiliar indicó el orden P10 → P9 y que
las notas son independientes. Cada ejecución añade una fila al CSV del directorio
actual; conservar por separado los resultados de distintas versiones del script.
Los originales se identifican mediante los hashes de `evidencias/verificadores.sha256`.

Las expresiones JSON defectuosas de los originales deben explicarse al auxiliar
con el reporte y los recursos reales. No se cambia el puntaje ni se interpreta
el resultado de una copia como si lo hubiera emitido el original.

## Carga de la prueba

El cliente usa dos clientes concurrentes, una sesión autenticada y
una pausa de 500 ms entre iteraciones. Cada iteración consulta el catálogo y una
de cada tres consulta las solicitudes del usuario. La sesión se renueva cada
cuatro minutos. Al inicio crea una solicitud de prueba y envía un intento inválido
para comprobar los contadores de negocio. No se afirma capacidad para una carga
mayor que la ensayada. El canary sigue exigiendo cinco peticiones candidatas por
minuto y los umbrales de error y latencia declarados.
