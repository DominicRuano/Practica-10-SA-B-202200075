#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/scripts/lib.sh"

check_cluster
bash "$P10_DIR/scripts/verify.sh"
[[ $(kubectl get nodes -o json | jq '.items | length') == 3 ]] || fail 'Revisar la infraestructura: se esperan los tres nodos de P9.'
umask 077
mkdir -p "$PRIVATE_DIR" "$RUNTIME_DIR" "$EVIDENCE_DIR"

for service in gateway solicitudes catalogo; do
  image=$(image_reference "$service")
  cosign verify "$image" \
    --certificate-identity 'https://github.com/DominicRuano/Practicas-SA-B-202200075/.github/workflows/p10-observability.yml@refs/heads/main' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com > "$RUNTIME_DIR/$service-signature.json"
done

bash "$P10_DIR/scripts/prepare-grafana.sh"

kubectl annotate application sa-p9-root -n argocd argocd.argoproj.io/refresh=hard --overwrite
for name in p10-monitoring p10-observability; do
  wait_application "$name"
done
for service in autenticacion gateway solicitudes catalogo; do
  deadline=$((SECONDS + 1200))
  until kubectl get rollout "$service" -n "$NS" -o json 2>/dev/null | jq -e '.status.readyReplicas >= 1' >/dev/null; do
    (( SECONDS < deadline )) || fail "El servicio $service no tiene una replica lista para iniciar el trafico."
    sleep 10
  done
done
active_clients=$(kubectl get jobs -n "$NS" -o json | jq '[.items[] | select(.metadata.name | startswith("p10-trafico")) | select((.status.active // 0) > 0)] | length')
if [[ "$active_clients" == 0 ]]; then
  kubectl create job "p10-trafico-bootstrap-$(date -u +%H%M%S)" --from=cronjob/p10-traffic-client -n "$NS"
fi
for name in p9-platform sa-p9-root; do
  wait_application "$name"
done
for service in gateway solicitudes catalogo; do
  deadline=$((SECONDS + 1200))
  expected_image=$(image_reference "$service")
  until kubectl get rollout "$service" -n "$NS" -o json | jq -e --arg image "$expected_image" '
    .spec.template.spec.containers[0].image == $image and
    .status.phase == "Healthy" and .status.readyReplicas >= 2 and
    (.status.observedGeneration | tostring) == (.metadata.generation | tostring) and
    .status.currentPodHash == .status.stableRS
  ' >/dev/null; do
    (( SECONDS < deadline )) || fail "El Rollout $service no termino su promocion."
    sleep 10
  done
done
printf 'P10 desplegada mediante GitOps. Ejecutar la comprobacion funcional y los verificadores originales.\n'
