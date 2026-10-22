#!/usr/bin/env bash
# Publishes one release: the multi-arch container image and the Helm chart (both to GHCR).
# Called by semantic-release (@semantic-release/exec publishCmd) with the next version.
#
#   scripts/publish.sh <version> [--dry-run]
#
#   <version>   semver without a leading "v", e.g. 1.2.3 or 1.3.0-rc.1 (no build metadata)
#   --dry-run   build the image for the host platform only (--load, nothing is pushed) and
#               package the chart into a temporary directory; nothing leaves the machine.
#
# A real run needs a prior `docker login ghcr.io` (docker/login-action in CI), a buildx
# builder that can build multi-platform images (docker/setup-buildx-action + QEMU in CI) and helm.
#
# Existing artifacts are never overwritten. In a real run the script first asks GHCR whether the
# image tag / chart version already exists and skips that part if it does (so a publish that failed
# half-way can be resumed). The answer is tri-state: exists, definitely not found, or unknown.
# "Unknown" (network error, 401/403, timeout, 5xx, ...) ABORTS the script with a non-zero exit
# before anything is built or pushed. "Not found" means the command's output (stdout+stderr)
# matches NOT_FOUND_RE below:
#   docker buildx imagetools inspect <image:tag>   -> "<ref>: not found" (registry 404, containerd resolver)
#   helm show chart oci://<repo>/rps-arena --version <v>
#                                                  -> "...manifests/<v>: not found" (oras 404)
#   both, when the registry answers with its error code text: MANIFEST_UNKNOWN / NAME_UNKNOWN, or "404".
# A skipped image also leaves the "latest" tag untouched. --dry-run never contacts the registry.
#
# Recovery: semantic-release creates the git tag and the GitHub Release BEFORE calling this script.
# If this script fails, the tag exists and re-running the "release" workflow will NOT call it again
# (nothing new to release). Re-publish the artifacts of that tag with the "release" workflow's manual
# trigger (Actions -> release -> Run workflow -> version, e.g. 1.2.3), which runs this script on
# the tag's commit, or run `scripts/publish.sh <version>` manually from a checkout of the tag v<version>.
set -euo pipefail

IMAGE="ghcr.io/jaydee94/rps-arena"
CHART_REPO="oci://ghcr.io/jaydee94/charts"
CHART_REF="${CHART_REPO}/rps-arena"
PLATFORMS="linux/amd64,linux/arm64"
# Semver 2.0.0 core plus an optional prerelease; build metadata ("+...") is not a valid image tag.
# Registry answers that mean "this tag/version definitely does not exist" (case-insensitive ERE).
NOT_FOUND_RE=': not found|MANIFEST_UNKNOWN|NAME_UNKNOWN|manifest unknown|name unknown|status code 404|404 Not Found'
SEMVER_RE='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'

usage() {
  echo "usage: $0 <version> [--dry-run]" >&2
}

die() {
  echo "error: $*" >&2
  exit 1
}

version=""
dry_run=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    -h | --help) usage; exit 0 ;;
    -*) usage; die "unknown option '$arg'" ;;
    *)
      [ -z "$version" ] || { usage; die "unexpected extra argument '$arg'"; }
      version="$arg"
      ;;
  esac
done
[ -n "$version" ] || { usage; die "missing <version>"; }
[[ "$version" =~ $SEMVER_RE ]] || die "'$version' is not a valid semantic version (expected e.g. 1.2.3 or 1.3.0-rc.1, without a leading 'v' and without build metadata)"

# Always work from the repository root, whatever the caller's cwd is.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for tool in docker helm git; do
  command -v "$tool" >/dev/null 2>&1 || die "required tool '$tool' not found in PATH"
done

# exists_in_registry <description> <command...>
# Returns 0 if the command succeeds (the artifact exists), 1 if it fails with a "not found" answer
# (see NOT_FOUND_RE), and aborts the whole script for any other failure.
exists_in_registry() {
  local what="$1" out rc=0
  shift
  out="$("$@" 2>&1)" || rc=$?
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  if grep -Eiq "$NOT_FOUND_RE" <<<"$out"; then
    return 1
  fi
  echo "error: could not determine whether ${what} exists (exit code ${rc}); aborting before anything is built or pushed:" >&2
  head -n 5 <<<"$out" | sed 's/^/    /' >&2
  exit 3
}

revision="$(git rev-parse HEAD)"

# "latest" only moves for stable versions (no prerelease suffix).
tags=(-t "${IMAGE}:${version}")
if [[ "$version" != *-* ]]; then
  tags+=(-t "${IMAGE}:latest")
fi

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

echo "==> Publishing rps-arena ${version} (revision ${revision:0:12}, dry-run: ${dry_run})"

# ---- container image -------------------------------------------------------------------
build_args=(--build-arg "VERSION=${version}" --build-arg "REVISION=${revision}")
image_done=false
if [ "$dry_run" = true ]; then
  echo "==> [dry-run] Building ${IMAGE}:${version} for the host platform only (loaded, not pushed)"
  docker buildx build "${build_args[@]}" "${tags[@]}" --load .
  image_done=true
elif exists_in_registry "image ${IMAGE}:${version}" docker buildx imagetools inspect "${IMAGE}:${version}"; then
  echo "==> ${IMAGE}:${version} already exists in the registry; not rebuilding or overwriting it"
else
  echo "==> Building and pushing ${IMAGE}:${version} for ${PLATFORMS}"
  docker buildx build --platform "$PLATFORMS" "${build_args[@]}" "${tags[@]}" --push .
  image_done=true
fi

# ---- Helm chart ------------------------------------------------------------------------
# The chart in the repository keeps placeholder versions (0.0.0); they are set here.
echo "==> Packaging chart charts/rps-arena as ${version}"
helm package charts/rps-arena --version "$version" --app-version "$version" --destination "$workdir"
chart_tgz="${workdir}/rps-arena-${version}.tgz"
[ -f "$chart_tgz" ] || die "helm package did not produce ${chart_tgz}"
# Sanity check: both versions in the packaged chart must be the release version.
chart_meta="$(helm show chart "$chart_tgz")"
grep -qx "version: ${version}" <<<"$chart_meta" || die "packaged chart has an unexpected 'version' (wanted ${version})"
grep -qx "appVersion: ${version}" <<<"$chart_meta" || die "packaged chart has an unexpected 'appVersion' (wanted ${version})"

chart_done=false
if [ "$dry_run" = true ]; then
  echo "==> [dry-run] Chart packaged as $(basename "$chart_tgz"); not pushing"
  chart_done=true
elif exists_in_registry "chart ${CHART_REF}:${version}" helm show chart "$CHART_REF" --version "$version"; then
  echo "==> ${CHART_REF}:${version} already exists in the registry; not overwriting it"
else
  echo "==> Pushing chart to ${CHART_REPO}"
  helm push "$chart_tgz" "$CHART_REPO"
  chart_done=true
fi

# ---- summary ---------------------------------------------------------------------------
echo "==> Done."
if [ "$dry_run" = true ]; then
  echo "    image: ${IMAGE}:${version} built for the host platform and loaded locally (not pushed)"
  echo "    chart: rps-arena-${version}.tgz packaged (version and appVersion ${version}); not pushed"
else
  if [ "$image_done" = true ]; then
    echo "    image: pushed ${tags[*]//-t /} for ${PLATFORMS}"
  else
    echo "    image: skipped (already published)"
  fi
  if [ "$chart_done" = true ]; then
    echo "    chart: pushed ${CHART_REF}:${version}"
  else
    echo "    chart: skipped (already published)"
  fi
fi
