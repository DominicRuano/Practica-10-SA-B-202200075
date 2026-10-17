#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
registry=${P10_REGISTRY:-local/sa-p10}
version=${P10_VERSION:-$(cat "$root/P10/VERSION")}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'La version debe tener formato X.Y.Z.' >&2; exit 1; }

for service in gateway solicitudes catalogo; do
  context="$root/P10"
  dockerfile="$root/P10/services/$service/Dockerfile"
  if [[ "$service" == catalogo ]]; then
    context="$root/P10/services/catalogo"
  fi
  docker build --target runtime -t "$registry/$service:$version" -f "$dockerfile" "$context"
done
