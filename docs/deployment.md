# Deployment with Helm

How to install the game on Kubernetes with the Helm chart, with the bundled or your own Redis.

The chart lives in [`charts/rps-arena`](../charts/rps-arena). Every release publishes it as an OCI artifact to
`ghcr.io/jaydee94/charts/rps-arena` (chart name `rps-arena`; `version` and `appVersion` are the release version).
The chart in the repository carries the placeholder `0.0.0`. It deploys the app (server with embedded web app), a
Service, optionally an Ingress and, by default, a simple Redis.

## Install

```bash
helm install rps oci://ghcr.io/jaydee94/charts/rps-arena --version 1.0.0 \
  --namespace rps --create-namespace -f values.yaml
```

- `--version` is a published release.
- If the chart package is private, log in first with `helm registry login ghcr.io`.
- With the release name `rps`, the resources are named `rps-rps-arena` (and `rps-rps-arena-redis`).

Example `values.yaml`:

```yaml
replicaCount: 2

image:
  tag: ""            # empty = appVersion of the chart

resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits: { cpu: 500m, memory: 256Mi }

ingress:
  enabled: true
  className: nginx
  host: rps.example.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod   # sets the annotation cert-manager.io/cluster-issuer

# Your own Redis instead of the bundled one (URL without password; with a password see redis.existingSecret below):
redis:
  enabled: false
  externalUrl: redis://redis.example.internal:6379
```

- All values and defaults are in [`charts/rps-arena/values.yaml`](../charts/rps-arena/values.yaml).
- More environment variables for the container go into the `env` map.
- Without an Ingress, reach the game with `kubectl --namespace rps port-forward svc/rps-rps-arena 8080:80`. The
  notes after `helm install` print the matching command.

## Redis

- **Bundled** (`redis.enabled: true`, the default): one Redis (`redis:7-alpine`) without authentication and
  without persistence. If it fails, running rooms are lost. `redis.persistence.enabled=true` creates a PVC
  (`redis.persistence.size`, `storageClass`). Memory limits: see [operations.md](operations.md#redis).
- **Your own** (`redis.enabled: false`): set `redis.externalUrl` or `redis.existingSecret`, otherwise
  `helm template` aborts with a clear message.
- `redis.externalUrl` appears in plain text in the Deployment (and in `helm get values`). Use it only for a URL
  without a password. With a password, put the URL in your own Secret:

```bash
kubectl --namespace rps create secret generic rps-redis \
  --from-literal=redis-url='rediss://user:password@redis.example.internal:6379'
helm upgrade --install rps ... --set redis.enabled=false --set redis.existingSecret=rps-redis
```

`REDIS_URL` then comes from the Secret via `secretKeyRef` (key `redis.existingSecretKey`, default `redis-url`).
`redis.externalUrl` is not needed, and the Secret wins if both are set. The notes after `helm install` and
`upgrade` (and so the CI logs) never print the URL, only whether an external Redis is configured.

## Ingress

- **WebSocket timeouts:** the annotations `nginx.ingress.kubernetes.io/proxy-read-timeout` and
  `proxy-send-timeout` default to 3600 s (ingress-nginx). For other controllers, set them via
  `ingress.annotations`.
- **Keep the `Host` header:** the server accepts a WebSocket only if the browser's `Origin` matches the request's
  `Host` (no CORS, `apps/server/src/io.ts`). A proxy that rewrites `Host` gets its connections rejected.
- **No sticky sessions needed.** The state is in Redis; several replicas are the normal case.
- Ingress only, no Gateway API.

## Probes and security

- Liveness `GET /healthz`, readiness `GET /readyz` (200 only if Redis answers).
- The container runs as non-root (UID/GID 1000), with `readOnlyRootFilesystem`, no privilege escalation, no Linux
  capabilities and the seccomp profile `RuntimeDefault`. `/tmp` is an `emptyDir`.
- Default resources: 50m CPU / 96Mi request, 500m CPU / 256Mi limit.

## Checking the chart

```bash
helm lint charts/rps-arena
bash scripts/helm-check.sh   # needs helm and yq, plus kubeconform or Docker
```

[`scripts/helm-check.sh`](../scripts/helm-check.sh) lints the chart in several variants, renders it with
`helm template`, checks the key properties with `yq` (security context, probes, Redis variants, Ingress, no sticky
annotations) and validates the manifests with kubeconform.
