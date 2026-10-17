#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
check_cluster

while true; do
  kubectl port-forward -n "$NS" service/gateway 8080:8080 || true
  sleep 1
done
