#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

checkout=${1:?Indicar el checkout del repositorio GitOps}
scenario=${2:?Indicar failure o restore}
check_cluster
[[ $(git -C "$checkout" remote get-url origin) == "$REPO_GITOPS"* ]] || fail 'El destino no corresponde al repositorio GitOps.'
[[ -z $(git -C "$checkout" status --porcelain) ]] || fail 'El checkout GitOps tiene cambios pendientes.'

case "$scenario" in
  failure) delay=2500 ;;
  restore) delay=0 ;;
  *) fail 'Escenario invalido: failure|restore' ;;
esac
python3 - "$checkout/p10/platform-values.yaml" "$delay" <<'PY'
import sys
from pathlib import Path
import yaml
path = Path(sys.argv[1])
values = yaml.safe_load(path.read_text())
values['catalogo']['config']['FAULT_DELAY_MS'] = sys.argv[2]
path.write_text(yaml.safe_dump(values, sort_keys=False))
PY

git -C "$checkout" add p10/platform-values.yaml
git -C "$checkout" commit -m "Practica 10: prueba de latencia $scenario"
git -C "$checkout" push origin main
kubectl annotate application p9-platform -n argocd argocd.argoproj.io/refresh=hard --overwrite
printf 'Cambio publicado. Observar el Rollout catalogo y sus AnalysisRuns.\n'
