#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

expected="gke_${PROJECT_ID}_${ZONE}_${CLUSTER}"
[[ $(kubectl config current-context) == "$expected" ]] || fail "Se requiere el contexto $expected."

umask 077
mkdir -p "$PRIVATE_DIR"
kubectl get namespace observabilidad >/dev/null 2>&1 || kubectl create namespace observabilidad
if ! kubectl get secret p10-grafana-admin -n observabilidad >/dev/null 2>&1; then
  if [[ ! -s "$PRIVATE_DIR/grafana-password" ]]; then
    openssl rand -hex 24 | tr -d '\n' > "$PRIVATE_DIR/grafana-password"
  fi
  kubectl create secret generic p10-grafana-admin -n observabilidad \
    --from-literal=admin-user=admin --from-file="admin-password=$PRIVATE_DIR/grafana-password" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
fi
