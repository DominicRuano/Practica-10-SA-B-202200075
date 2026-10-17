#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
check_cluster
root="$ROOT_DIR"
mkdir -p "$root/P10/.runtime"

for service in 'p10-monitoring-grafana 3000:80' 'p10-monitoring-prometheus 9090:9090' 'p10-monitoring-alertmanager 9093:9093' 'p10-tempo 3200:3200' 'p10-loki 3100:3100'; do
  read -r name ports <<< "$service"
  nohup kubectl port-forward -n observabilidad "service/$name" "$ports" \
    </dev/null > "$root/P10/.runtime/$name.log" 2>&1 &
  printf '%s\n' "$!" >> "$root/P10/.runtime/access.pids"
done
printf 'Grafana: http://127.0.0.1:3000/d/p10-operacion\nPrometheus: http://127.0.0.1:9090\nAlertmanager: http://127.0.0.1:9093\n'
