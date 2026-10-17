#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"
for script in P10/scripts/*.sh; do bash -n "$script"; done
helm lint --strict P10/gitops/observability
rendered=$(mktemp -d)
trap 'rm -rf "$rendered"' EXIT
helm template p10 P10/gitops/observability > "$rendered/observability.yaml"
chart="$root/P9/gitops/platform"
if [[ ! -d "$chart" ]]; then
  git clone --quiet --depth 1 https://github.com/DominicRuano/Practicas-SA-B-202200075-gitops "$rendered/gitops"
  chart="$rendered/gitops/p9/platform"
fi
helm template p9-platform "$chart" -n sa-p9 -f P10/gitops/platform-values.yaml > "$rendered/platform.yaml"
python3 P10/tests/check_manifests.py "$rendered"
if [[ -f P9/scripts/verify.sh ]]; then
  bash P9/scripts/verify.sh
fi
printf '%s  %s\n' 0f423f0112af77678177bc461dd035b065783e0136bffa3a5b35143ef30616f3 verificar_p10.sh | sha256sum --check
