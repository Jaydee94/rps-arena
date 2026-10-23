# Release and CI

How commits turn into releases, what the CI checks, how to fix a failed publish, and how Renovate updates
dependencies.

## Commits and versions

Commit messages (for squash merges: the PR title) follow
[Conventional Commits](https://www.conventionalcommits.org/). The rules are in
[`.releaserc.json`](../.releaserc.json):

| Commit | Release |
| --- | --- |
| `feat` | minor |
| `fix`, `perf` | patch |
| `fix(deps)` (Renovate) | patch |
| Breaking change (`feat!:` or footer `BREAKING CHANGE:`) | major |
| `docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style` | no release |

The first release is `1.0.0`.

## Release workflow

Every push to `main` starts [`release.yml`](../.github/workflows/release.yml):

1. Install the dependencies and run `npm run lint && npm run typecheck && npm test` as a quality gate. (The
   end-to-end test runs only in the PR CI.)
2. Run semantic-release. If the commits justify a release, it produces:
   - the Git tag `vX.Y.Z` and a GitHub Release with a changelog;
   - the multi-arch image (linux/amd64, linux/arm64) `ghcr.io/jaydee94/rps-arena:X.Y.Z`, plus `:latest` for
     stable versions;
   - the Helm chart `oci://ghcr.io/jaydee94/charts/rps-arena` in version `X.Y.Z` (`appVersion` `X.Y.Z`).

**Nothing is committed back to `main`.** semantic-release only sets the tag and the GitHub Release. The chart gets
its version only when [`scripts/publish.sh`](../scripts/publish.sh) packages it. So `main` needs no
branch-protection exception and no bot token. `publish.sh` never overwrites an existing image or chart and aborts
if the registry does not answer clearly.

**Fast multi-arch build:** the Dockerfile builds the stages `source`, `build`, `test` and `deps` on the build
platform (`--platform=$BUILDPLATFORM`), so `npm ci` and the Vite build for arm64 do not run under QEMU. This works
because the server bundle, the SPA and the production dependencies are pure JavaScript. The test
[`scripts/dockerfile-deps.test.ts`](../scripts/dockerfile-deps.test.ts) fails as soon as a production dependency
becomes platform-specific. Only the final stage `runtime` is built for the target platform, and it has no `RUN`.

## Pull requests

Merging is by **squash merge** with a Conventional Commit title.
[`pr-title.yml`](../.github/workflows/pr-title.yml) checks the PR title (allowed types: `feat`, `fix`, `perf`,
`docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style`). The PR CI [`ci.yml`](../.github/workflows/ci.yml)
runs on pull requests against `main` (and by hand):

| Job | Contents |
| --- | --- |
| `test` | `npm ci`, lint, type check, tests (with a Redis service, so the Redis tests run) |
| `e2e` | Build and Playwright tests with Chromium (on failure, the report is uploaded as an artifact) |
| `image` | Docker build without push |
| `chart` | `scripts/helm-check.sh` (Helm lint, `helm template`, kubeconform) |
| `renovate-config` | Validates `renovate.json` with the Renovate config validator (`--strict`) |

## When publishing fails

semantic-release creates the tag and GitHub Release *before* it calls `scripts/publish.sh`. If publishing the
image or chart fails, a re-run finds nothing new and does nothing. Instead:

- **Actions → release → Run workflow** with the existing version without the `v`, for example `1.2.3`. The
  `republish` job checks out the tag, rebuilds image and chart and publishes both. Existing artifacts are not
  overwritten, so this completes a half-finished release.
- Or by hand (needs `docker`, `helm`, `git` and a buildx builder for multi-platform images, for example with QEMU):

```bash
git checkout v1.2.3
docker login ghcr.io
bash scripts/publish.sh 1.2.3
# Dry run: builds locally for your own platform only, pushes nothing, does not contact the registry
bash scripts/publish.sh 1.2.3 --dry-run
```

## First publish

For packages that do not exist yet, GHCR answers `403 denied`. That looks the same as a real permission problem,
so `publish.sh` normally aborts on it and pushes nothing.

- At the very first release there is nothing to overwrite. The `publishCmd` in
  [`.releaserc.json`](../.releaserc.json) sets `PUBLISH_ASSUME_MISSING=1` exactly when semantic-release knows no
  earlier release (`lastRelease.version` is empty), and leaves it empty for every later release. So the first
  release needs **no manual step**.
- With the flag, an authorization answer counts as "package does not exist yet" (warning in the log). Network
  errors, timeouts and server errors still abort. Only exactly `1` counts; an empty value unlocks nothing.
- The test [`scripts/release-config.test.ts`](../scripts/release-config.test.ts) renders `publishCmd` with the same
  lodash function as semantic-release and checks both cases.

If the very first run still fails while publishing (tag and GitHub Release already exist), use the manual run
above with the generated version (for example `1.0.0`) and **`first_publish = true`**. By hand:
`bash scripts/publish.sh 1.0.0 --assume-missing` (or `PUBLISH_ASSUME_MISSING=1`). Never set `first_publish` for
later releases. A push run sets the flag only through the first-release rule.

## Renovate

[`renovate.json`](../renovate.json) extends `config:recommended` and covers npm, Dockerfile, GitHub Actions and
Helm, plus two custom managers (the Node image in the Dockerfile and the pinned Renovate version in the job
`renovate-config`). Details and reasons are in the `description` fields of the file.

- Renovate commits use the prefix `fix(deps)`, so an update makes a patch release. Exceptions use `build(deps)`
  (no release): the release tooling and the Renovate version pinned in `ci.yml` (it only affects CI validation;
  automerge applies as usual).
- Minor and patch updates of npm dependencies are grouped into one PR and merged automatically (platform
  automerge) once the required checks are green. **Major updates stay manual.**
- The release tooling (`semantic-release` and its plugins) has its own group, no automerge and the prefix
  `build(deps)`, so it triggers no release and is reviewed by hand.
- Version limits: `@mediapipe/tasks-vision` stays below 1.0 (telemetry, see
  [operations.md](operations.md#camera-control)) and `conventional-changelog-conventionalcommits` below 10
  (incompatible with the release notes generator).
- The Node major version of the Dockerfile image follows `.nvmrc` and is raised by hand.

The CI job `renovate-config` validates the configuration.
