import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs scripts/publish.sh against fake `docker` and `helm` executables (first on PATH) that record
// every invocation. No network and no real docker/helm are involved.

const script = fileURLToPath(new URL('./publish.sh', import.meta.url));
let sandbox: string;
let fakeBin: string;

const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
if [ "$1 $2" = "buildx imagetools" ]; then
  case "$FAKE_IMAGE" in
    exists) echo "Name: $4"; exit 0 ;;
    missing) echo "ERROR: $4: not found" >&2; exit 1 ;;
    *) echo "$FAKE_IMAGE" >&2; exit 1 ;;
  esac
fi
exit 0
`;

const FAKE_HELM = `#!/usr/bin/env bash
echo "helm $*" >> "$FAKE_LOG"
case "$1" in
  package)
    version=""; app=""; dest=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --version) version="$2"; shift ;;
        --app-version) app="$2"; shift ;;
        --destination) dest="$2"; shift ;;
      esac
      shift
    done
    printf 'version: %s\\nappVersion: %s\\n' "$version" "$app" > "$dest/rps-arena-$version.tgz"
    echo "Successfully packaged chart and saved it to: $dest/rps-arena-$version.tgz"
    ;;
  show)
    case "$3" in
      oci://*)
        case "$FAKE_CHART" in
          exists) echo "name: rps-arena"; exit 0 ;;
          missing) echo "Error: failed to perform FetchReference: $3: not found" >&2; exit 1 ;;
          *) echo "$FAKE_CHART" >&2; exit 1 ;;
        esac
        ;;
      *) cat "$3" ;;
    esac
    ;;
  push) exit 0 ;;
esac
`;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'publish-test-'));
  fakeBin = join(sandbox, 'bin');
  mkdirSync(fakeBin);
  for (const [name, body] of [['docker', FAKE_DOCKER], ['helm', FAKE_HELM]] as const) {
    writeFileSync(join(fakeBin, name), body);
    chmodSync(join(fakeBin, name), 0o755);
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  output: string;
  calls: string[];
}

let counter = 0;
function run(args: string[], env: { image?: string; chart?: string; assumeMissing?: string } = {}): Run {
  const log = join(sandbox, `calls-${counter++}.log`);
  writeFileSync(log, '');
  const result = spawnSync('bash', [script, ...args], {
    cwd: sandbox, // the script must find the repository root by itself
    encoding: 'utf8',
    env: {
      PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
      HOME: sandbox,
      FAKE_LOG: log,
      FAKE_IMAGE: env.image ?? 'missing',
      FAKE_CHART: env.chart ?? 'missing',
      ...(env.assumeMissing === undefined ? {} : { PUBLISH_ASSUME_MISSING: env.assumeMissing }),
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

const called = (r: Run, needle: string) => r.calls.filter((c) => c.includes(needle));
const IMAGE = 'ghcr.io/jaydee94/rps-arena';

describe('publish.sh image step', () => {
  it('builds and pushes a multi-arch image (with :latest) when the tag is definitely not found', () => {
    const r = run(['1.2.3'], { image: 'missing', chart: 'missing' });
    expect(r.status).toBe(0);
    const [build] = called(r, 'buildx build');
    expect(build).toContain('--platform linux/amd64,linux/arm64');
    expect(build).toContain('--push');
    expect(build).not.toContain('--load');
    expect(build).toContain('--build-arg VERSION=1.2.3');
    expect(build).toMatch(/--build-arg REVISION=[0-9a-f]{40}/);
    expect(build).toContain(`-t ${IMAGE}:1.2.3`);
    expect(build).toContain(`-t ${IMAGE}:latest`);
  });

  it('skips the build when the image tag already exists, and does not move :latest', () => {
    const r = run(['1.2.3'], { image: 'exists', chart: 'missing' });
    expect(r.status).toBe(0);
    expect(called(r, 'buildx build')).toHaveLength(0);
    expect(r.output).toContain('already exists');
  });

  it('only tags :latest for stable versions', () => {
    const r = run(['1.3.0-rc.1']);
    expect(r.status).toBe(0);
    const [build] = called(r, 'buildx build');
    expect(build).toContain(`-t ${IMAGE}:1.3.0-rc.1`);
    expect(build).not.toContain(':latest');
  });

  it.each(['dial tcp: connection refused', 'unauthorized: authentication required', 'context deadline exceeded'])(
    'aborts without building or pushing when the existence check fails with %j',
    (message) => {
      const r = run(['1.2.3'], { image: message });
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('could not determine');
      expect(called(r, 'buildx build')).toHaveLength(0);
      expect(called(r, 'helm push')).toHaveLength(0);
      expect(called(r, 'helm package')).toHaveLength(0);
    },
  );
});

describe('publish.sh chart step', () => {
  it('packages with both versions set and pushes when the chart version is definitely not found', () => {
    const r = run(['1.2.3'], { image: 'exists', chart: 'missing' });
    expect(r.status).toBe(0);
    expect(called(r, 'helm package')[0]).toMatch(/charts\/rps-arena --version 1\.2\.3 --app-version 1\.2\.3 --destination /);
    expect(called(r, 'helm push')).toHaveLength(1);
    expect(called(r, 'helm push')[0]).toMatch(/rps-arena-1\.2\.3\.tgz oci:\/\/ghcr\.io\/jaydee94\/charts$/);
  });

  it('skips the push when the chart version already exists', () => {
    const r = run(['1.2.3'], { image: 'exists', chart: 'exists' });
    expect(r.status).toBe(0);
    expect(called(r, 'helm push')).toHaveLength(0);
    expect(r.output).toContain('already exists');
  });

  it.each(['dial tcp: i/o timeout', 'response status code 401: unauthorized', 'response status code 503: Service Unavailable'])(
    'aborts without pushing when the existence check fails with %j',
    (message) => {
      const r = run(['1.2.3'], { image: 'exists', chart: message });
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('could not determine');
      expect(called(r, 'helm push')).toHaveLength(0);
    },
  );
});

describe('publish.sh --dry-run', () => {
  it('never contacts the registry: builds for the host with --load, packages, pushes nothing', () => {
    // Registry answers would be errors; a dry run must not even ask.
    const r = run(['0.0.0-test', '--dry-run'], { image: 'connection refused', chart: 'connection refused' });
    expect(r.status).toBe(0);
    expect(called(r, 'imagetools')).toHaveLength(0);
    expect(called(r, 'oci://')).toHaveLength(0);
    expect(called(r, 'helm push')).toHaveLength(0);
    const [build] = called(r, 'buildx build');
    expect(build).toContain('--load');
    expect(build).not.toContain('--push');
    expect(build).not.toContain('--platform');
    expect(called(r, 'helm package')).toHaveLength(1);
  });

  it('accepts the flag before the version', () => {
    expect(run(['--dry-run', '1.0.0']).status).toBe(0);
  });
});

const DENIED = 'response status code 403: denied: requested access to the resource is denied';

describe('publish.sh --assume-missing (first publish; GHCR answers 403 for packages that do not exist yet)', () => {
  it('aborts on an authorization answer without the flag, building and pushing nothing', () => {
    for (const env of [{ image: DENIED }, { image: 'exists', chart: DENIED }]) {
      const r = run(['1.0.0'], env);
      expect(r.status).toBe(3);
      expect(called(r, 'buildx build')).toHaveLength(0);
      expect(called(r, 'helm push')).toHaveLength(0);
    }
  });

  it.each([
    ['the flag', ['1.0.0', '--assume-missing'], undefined],
    ['the env variable', ['1.0.0'], '1'],
  ])('treats an image authorization answer as missing with %s, and warns', (_name, args, assumeMissing) => {
    const r = run(args, { image: DENIED, chart: 'exists', ...(assumeMissing ? { assumeMissing } : {}) });
    expect(r.status).toBe(0);
    expect(r.output).toContain(`WARNING: assuming image ${IMAGE}:1.0.0 does not exist (authorization answer`);
    expect(called(r, 'buildx build')).toHaveLength(1);
    expect(called(r, 'buildx build')[0]).toContain('--push');
  });

  it.each(['', '0'])('does not enable the escape hatch for PUBLISH_ASSUME_MISSING=%j', (value) => {
    // semantic-release renders `PUBLISH_ASSUME_MISSING= bash ...` for every release but the first.
    for (const env of [{ image: DENIED }, { image: 'exists', chart: DENIED }]) {
      const r = run(['1.0.0'], { ...env, assumeMissing: value });
      expect(r.status).toBe(3);
      expect(r.output).not.toContain('WARNING: assuming');
      expect(called(r, 'buildx build')).toHaveLength(0);
      expect(called(r, 'helm push')).toHaveLength(0);
    }
  });

  it('treats a chart authorization answer as missing with the flag, and warns', () => {
    const r = run(['1.0.0', '--assume-missing'], { image: 'exists', chart: '401 Unauthorized' });
    expect(r.status).toBe(0);
    expect(r.output).toContain('WARNING: assuming chart oci://ghcr.io/jaydee94/charts/rps-arena:1.0.0 does not exist (authorization answer');
    expect(called(r, 'helm push')).toHaveLength(1);
  });

  it('handles both at once on a first publish', () => {
    const r = run(['1.0.0', '--assume-missing'], { image: DENIED, chart: DENIED });
    expect(r.status).toBe(0);
    expect(called(r, 'buildx build')).toHaveLength(1);
    expect(called(r, 'helm push')).toHaveLength(1);
  });

  it.each(['dial tcp: connection refused', 'context deadline exceeded', 'response status code 503: Service Unavailable'])(
    'still aborts on %j even with the flag',
    (message) => {
      const image = run(['1.0.0', '--assume-missing'], { image: message });
      expect(image.status).toBe(3);
      expect(called(image, 'buildx build')).toHaveLength(0);
      const chart = run(['1.0.0', '--assume-missing'], { image: 'exists', chart: message });
      expect(chart.status).toBe(3);
      expect(called(chart, 'helm push')).toHaveLength(0);
    },
  );

  it('changes nothing for exists and not-found answers (no warning)', () => {
    const exists = run(['1.0.0', '--assume-missing'], { image: 'exists', chart: 'exists' });
    expect(exists.status).toBe(0);
    expect(called(exists, 'buildx build')).toHaveLength(0);
    expect(called(exists, 'helm push')).toHaveLength(0);
    expect(exists.output).not.toContain('WARNING');
    const missing = run(['1.0.0', '--assume-missing'], { image: 'missing', chart: 'missing' });
    expect(missing.status).toBe(0);
    expect(called(missing, 'buildx build')).toHaveLength(1);
    expect(called(missing, 'helm push')).toHaveLength(1);
    expect(missing.output).not.toContain('WARNING');
  });

  it('has no effect in a dry run: the registry is not contacted', () => {
    const r = run(['0.0.0-test', '--dry-run', '--assume-missing'], { image: DENIED, chart: DENIED, assumeMissing: '1' });
    expect(r.status).toBe(0);
    expect(called(r, 'imagetools')).toHaveLength(0);
    expect(called(r, 'oci://')).toHaveLength(0);
    expect(called(r, 'helm push')).toHaveLength(0);
    expect(r.output).not.toContain('WARNING');
  });
});

describe('publish.sh argument validation', () => {
  it.each(['not-a-version', 'v1.0.0', '1.0.0+build.5', '1.0', '01.0.0'])('rejects %j without calling docker or helm', (version) => {
    const r = run([version]);
    expect(r.status).not.toBe(0);
    expect(r.output).toContain('not a valid semantic version');
    expect(r.calls).toHaveLength(0);
  });
});
