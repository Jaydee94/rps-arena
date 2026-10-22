#!/usr/bin/env bash
# Verifies the Helm chart: lint, rendered manifests (via yq assertions) and
# schema validation (kubeconform). Exits non-zero on the first failed assertion.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART="$ROOT/charts/rps-arena"
KUBECONFORM_IMAGE="ghcr.io/yannh/kubeconform:v0.8.0-alpine"

for tool in helm yq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FAIL: required tool '$tool' not found" >&2; exit 2; }
done

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "ok: $*"
}

# render <args...>: helm template with the given extra args; aborts the script on failure.
render() {
  helm template rps "$CHART" "$@" || fail "helm template failed ($*)"
}

# q <manifests> <yq-expression>: evaluates the expression over all documents.
q() {
  printf '%s\n' "$1" | yq eval-all "$2" -
}

# assert_eq <description> <expected> <manifests> <yq-expression>
assert_eq() {
  local desc="$1" expected="$2" manifests="$3" expr="$4" actual
  actual="$(q "$manifests" "$expr")"
  [ "$actual" = "$expected" ] || fail "$desc (expected '$expected', got '$actual'; expr: $expr)"
  pass "$desc"
}

validate_schema() {
  local manifests="$1"
  if command -v kubeconform >/dev/null 2>&1; then
    printf '%s\n' "$manifests" | kubeconform -strict -summary - || fail "kubeconform reported errors"
  elif command -v docker >/dev/null 2>&1; then
    printf '%s\n' "$manifests" | docker run --rm -i "$KUBECONFORM_IMAGE" -strict -summary - \
      || fail "kubeconform (docker) reported errors"
  else
    fail "neither kubeconform nor docker is available"
  fi
}

DEPLOY='select(.kind == "Deployment" and .metadata.name == "rps-rps-arena")'
CONTAINER="$DEPLOY | .spec.template.spec.containers[0]"

[ -f "$CHART/Chart.yaml" ] || fail "chart not found at $CHART"

echo "== helm lint =="
helm lint "$CHART" || fail "helm lint (defaults)"
helm lint "$CHART" --set ingress.enabled=true --set ingress.host=rps.example.com \
  --set ingress.tls.enabled=true --set ingress.tls.clusterIssuer=letsencrypt \
  || fail "helm lint (ingress)"
helm lint "$CHART" --set redis.enabled=false --set redis.externalUrl=redis://ext:6379 \
  || fail "helm lint (external redis)"
helm lint "$CHART" --set redis.enabled=false --set redis.existingSecret=rps-redis \
  || fail "helm lint (external redis from a Secret)"
pass "helm lint"

echo "== defaults =="
DEFAULT="$(render)"
assert_eq "app deployment exists" "1" "$DEFAULT" "[$DEPLOY] | length"
assert_eq "readOnlyRootFilesystem true" "true" "$DEFAULT" "$CONTAINER | .securityContext.readOnlyRootFilesystem"
assert_eq "runAsNonRoot true" "true" "$DEFAULT" "$CONTAINER | .securityContext.runAsNonRoot"
assert_eq "runAsUser 1000" "1000" "$DEFAULT" "$CONTAINER | .securityContext.runAsUser"
assert_eq "allowPrivilegeEscalation false" "false" "$DEFAULT" "$CONTAINER | .securityContext.allowPrivilegeEscalation"
assert_eq "capabilities drop ALL" "ALL" "$DEFAULT" "$CONTAINER | .securityContext.capabilities.drop[0]"
assert_eq "seccomp RuntimeDefault" "RuntimeDefault" "$DEFAULT" "$CONTAINER | .securityContext.seccompProfile.type"
assert_eq "/tmp is an emptyDir mount" "/tmp" "$DEFAULT" "$CONTAINER | .volumeMounts[] | select(.name == \"tmp\") | .mountPath"
assert_eq "tmp volume is emptyDir" "true" "$DEFAULT" "$DEPLOY | .spec.template.spec.volumes[] | select(.name == \"tmp\") | has(\"emptyDir\")"
assert_eq "liveness probe /healthz" "/healthz" "$DEFAULT" "$CONTAINER | .livenessProbe.httpGet.path"
assert_eq "readiness probe /readyz" "/readyz" "$DEFAULT" "$CONTAINER | .readinessProbe.httpGet.path"
assert_eq "container port 8080" "8080" "$DEFAULT" "$CONTAINER | .ports[0].containerPort"
assert_eq "resources requests set" "true" "$DEFAULT" "$CONTAINER | (.resources.requests.cpu != null and .resources.requests.memory != null)"
assert_eq "resources limits set" "true" "$DEFAULT" "$CONTAINER | (.resources.limits.cpu != null and .resources.limits.memory != null)"
assert_eq "image repository + appVersion tag" "ghcr.io/jaydee94/rps-arena:0.0.0" "$DEFAULT" "$CONTAINER | .image"
assert_eq "PORT env is 8080" "8080" "$DEFAULT" "$CONTAINER | .env[] | select(.name == \"PORT\") | .value"
assert_eq "redis deployment exists" "1" "$DEFAULT" 'select(.kind == "Deployment" and .metadata.name == "rps-rps-arena-redis") | [.] | length'
assert_eq "redis service exists" "1" "$DEFAULT" 'select(.kind == "Service" and .metadata.name == "rps-rps-arena-redis") | [.] | length'
assert_eq "redis image pinned" "redis:7-alpine" "$DEFAULT" 'select(.kind == "Deployment" and .metadata.name == "rps-rps-arena-redis") | .spec.template.spec.containers[0].image'
assert_eq "REDIS_URL points to internal redis service" "redis://rps-rps-arena-redis:6379" "$DEFAULT" "$CONTAINER | .env[] | select(.name == \"REDIS_URL\") | .value"
assert_eq "app service exists" "1" "$DEFAULT" 'select(.kind == "Service" and .metadata.name == "rps-rps-arena") | [.] | length'
assert_eq "no ingress by default" "0" "$DEFAULT" '[select(.kind == "Ingress")] | length'
assert_eq "no PVC by default" "0" "$DEFAULT" '[select(.kind == "PersistentVolumeClaim")] | length'
validate_schema "$DEFAULT"

echo "== redis persistence =="
PERSIST="$(render --set redis.persistence.enabled=true)"
assert_eq "PVC rendered when persistence enabled" "1" "$PERSIST" '[select(.kind == "PersistentVolumeClaim")] | length'
assert_eq "redis mounts the data volume" "/data" "$PERSIST" 'select(.kind == "Deployment" and .metadata.name == "rps-rps-arena-redis") | .spec.template.spec.containers[0].volumeMounts[] | select(.name == "data") | .mountPath'
validate_schema "$PERSIST"

echo "== external redis =="
EXTERNAL="$(render --set redis.enabled=false --set redis.externalUrl=redis://ext:6379)"
assert_eq "no redis deployment" "0" "$EXTERNAL" '[select(.kind == "Deployment" and .metadata.name == "rps-rps-arena-redis")] | length'
assert_eq "no redis service" "0" "$EXTERNAL" '[select(.kind == "Service" and .metadata.name == "rps-rps-arena-redis")] | length'
assert_eq "REDIS_URL is the external url" "redis://ext:6379" "$EXTERNAL" "$CONTAINER | .env[] | select(.name == \"REDIS_URL\") | .value"
validate_schema "$EXTERNAL"

if MISSING="$(helm template rps "$CHART" --set redis.enabled=false 2>&1)"; then
  fail "helm template must fail when redis.enabled=false without redis.externalUrl"
fi
case "$MISSING" in
  *"redis.externalUrl"*"redis.existingSecret"*) pass "missing externalUrl fails with a clear message" ;;
  *) fail "error message does not mention redis.externalUrl and redis.existingSecret: $MISSING" ;;
esac

echo "== external redis credentials stay out of the output =="
SECRET_URL="redis://user:s3cret@redis.example.internal:6379"
# NOTES.txt is part of every `helm install/upgrade` output (and so of CI logs).
notes_of() {
  local out
  out="$(helm install rps "$CHART" --dry-run=client "$@" 2>&1)" || fail "helm install --dry-run failed ($*): $out"
  printf '%s\n' "${out#*NOTES:}"
}
NOTES_URL="$(notes_of --set redis.enabled=false --set "redis.externalUrl=$SECRET_URL")"
case "$NOTES_URL" in
  *s3cret* | *user:* | *redis://* | *redis.example.internal*) fail "NOTES.txt prints the external Redis URL: $NOTES_URL" ;;
  *) pass "NOTES.txt does not print redis.externalUrl" ;;
esac
case "$NOTES_URL" in
  *"external"*) pass "NOTES.txt still says that an external Redis is used" ;;
  *) fail "NOTES.txt does not mention the external Redis: $NOTES_URL" ;;
esac
SECRET_OUT="$(helm install rps "$CHART" --dry-run=client --set redis.enabled=false --set redis.existingSecret=rps-redis 2>&1)" \
  || fail "helm install --dry-run with redis.existingSecret failed: $SECRET_OUT"
case "$SECRET_OUT" in
  *rps-redis*) pass "NOTES.txt names the Secret (not its content)" ;;
  *) fail "NOTES.txt does not mention the Secret" ;;
esac

echo "== external redis from an existing Secret =="
FROM_SECRET="$(render --set redis.enabled=false --set redis.existingSecret=rps-redis)"
REDIS_ENV="$CONTAINER | .env[] | select(.name == \"REDIS_URL\")"
assert_eq "REDIS_URL comes from the Secret name" "rps-redis" "$FROM_SECRET" "$REDIS_ENV | .valueFrom.secretKeyRef.name"
assert_eq "REDIS_URL Secret key defaults to redis-url" "redis-url" "$FROM_SECRET" "$REDIS_ENV | .valueFrom.secretKeyRef.key"
assert_eq "no plain REDIS_URL value with a Secret" "null" "$FROM_SECRET" "$REDIS_ENV | .value"
assert_eq "exactly one REDIS_URL variable" "1" "$FROM_SECRET" "[$CONTAINER | .env[] | select(.name == \"REDIS_URL\")] | length"
assert_eq "no in-chart redis with an external one" "0" "$FROM_SECRET" '[select(.kind == "Deployment" and .metadata.name == "rps-rps-arena-redis")] | length'
CUSTOM_KEY="$(render --set redis.enabled=false --set redis.existingSecret=rps-redis --set redis.existingSecretKey=url)"
assert_eq "custom Secret key" "url" "$CUSTOM_KEY" "$REDIS_ENV | .valueFrom.secretKeyRef.key"
BOTH="$(render --set redis.enabled=false --set redis.existingSecret=rps-redis --set "redis.externalUrl=$SECRET_URL")"
assert_eq "the Secret wins over redis.externalUrl" "null" "$BOTH" "$REDIS_ENV | .value"
case "$BOTH" in
  *s3cret*) fail "rendered manifests contain the password although redis.existingSecret is set" ;;
  *) pass "no password in the manifests when the Secret is used" ;;
esac
validate_schema "$FROM_SECRET"

echo "== ingress =="
INGRESS="$(render --set ingress.enabled=true --set ingress.host=rps.example.com \
  --set ingress.tls.enabled=true --set ingress.tls.clusterIssuer=letsencrypt)"
ING='select(.kind == "Ingress")'
assert_eq "ingress exists" "1" "$INGRESS" "[$ING] | length"
assert_eq "ingress host" "rps.example.com" "$INGRESS" "$ING | .spec.rules[0].host"
assert_eq "ingress tls host" "rps.example.com" "$INGRESS" "$ING | .spec.tls[0].hosts[0]"
assert_eq "ingress tls secret" "rps-rps-arena-tls" "$INGRESS" "$ING | .spec.tls[0].secretName"
assert_eq "cert-manager cluster-issuer annotation" "letsencrypt" "$INGRESS" "$ING | .metadata.annotations.\"cert-manager.io/cluster-issuer\""
assert_eq "websocket proxy-read-timeout" "3600" "$INGRESS" "$ING | .metadata.annotations.\"nginx.ingress.kubernetes.io/proxy-read-timeout\""
assert_eq "websocket proxy-send-timeout" "3600" "$INGRESS" "$ING | .metadata.annotations.\"nginx.ingress.kubernetes.io/proxy-send-timeout\""
assert_eq "no sticky-session annotations" "0" "$INGRESS" "[$ING | .metadata.annotations | keys | .[] | select(test(\"affinity\"))] | length"
assert_eq "ingress routes to app service" "rps-rps-arena" "$INGRESS" "$ING | .spec.rules[0].http.paths[0].backend.service.name"
validate_schema "$INGRESS"

PLAIN_ING="$(render --set ingress.enabled=true --set ingress.host=rps.example.com)"
assert_eq "no tls block without tls.enabled" "null" "$PLAIN_ING" "$ING | .spec.tls"
assert_eq "no cluster-issuer without tls" "null" "$PLAIN_ING" "$ING | .metadata.annotations.\"cert-manager.io/cluster-issuer\""

echo "== helm template | kubeconform (all features) =="
validate_schema "$(render --set ingress.enabled=true --set ingress.host=rps.example.com \
  --set ingress.tls.enabled=true --set ingress.tls.clusterIssuer=letsencrypt \
  --set redis.persistence.enabled=true)"

echo "All helm checks passed."
