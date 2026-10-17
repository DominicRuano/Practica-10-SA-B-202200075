#!/usr/bin/env bash
set -euo pipefail

P10_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ROOT_DIR=$(dirname "$P10_DIR")
source "$P10_DIR/p10.conf"
RUNTIME_DIR="$P10_DIR/.runtime"
PRIVATE_DIR="$P10_DIR/.private"
EVIDENCE_DIR="$P10_DIR/docs/evidencias"
if [[ -z ${KUBECONFIG:-} && -f "$ROOT_DIR/P9/.runtime/kubeconfig" ]]; then
  export KUBECONFIG="$ROOT_DIR/P9/.runtime/kubeconfig"
fi
if [[ -d "$ROOT_DIR/P9/.runtime/bin" ]]; then
  export PATH="$ROOT_DIR/P9/.runtime/bin:$PATH"
fi

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
image_reference() {
  python3 - "$P10_DIR/gitops/platform-values.yaml" "$1" <<'PY'
import sys
from pathlib import Path
import yaml

values = yaml.safe_load(Path(sys.argv[1]).read_text())
print(values[sys.argv[2]]['image']['reference'])
PY
}
check_cluster() {
  local expected="gke_${PROJECT_ID}_${ZONE}_${CLUSTER}"
  [[ $(kubectl config current-context) == "$expected" ]] || fail "Se requiere el contexto de P9: $expected"
  kubectl get namespace "$NS" >/dev/null
}
wait_application() {
  local name=$1
  local deadline=$((SECONDS + 1800))
  while (( SECONDS < deadline )); do
    if kubectl get application "$name" -n argocd -o json | jq -e '.status.sync.status == "Synced" and .status.health.status == "Healthy"' >/dev/null; then
      printf 'Aplicacion lista: %s\n' "$name"
      return
    fi
    sleep 10
  done
  fail "La aplicacion $name no quedo lista."
}
