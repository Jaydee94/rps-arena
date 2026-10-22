import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Dockerfile installs the production dependencies (stage `deps`) on the BUILD platform and copies
// node_modules into the runtime stage of the target platform. That only works while the production
// tree of @rps/server is plain JavaScript. This walks it in package-lock.json and fails as soon as a
// package needs an OS/CPU-specific build, so nobody ships an amd64 binary in the arm64 image.

interface LockPackage {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  hasInstallScript?: boolean;
  optional?: boolean;
}

const lock = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package-lock.json', import.meta.url)), 'utf8'),
) as { packages: Record<string, LockPackage> };

/** Node resolution inside the lockfile: the nearest node_modules/<name> up the tree. */
function resolve(from: string, name: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    if (dir === '') return null;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut >= 0 ? dir.slice(0, cut) : '';
  }
}

function productionClosure(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const pkg = lock.packages[path];
    for (const name of Object.keys({ ...pkg?.dependencies, ...pkg?.optionalDependencies })) {
      const target = resolve(path, name);
      if (target) visit(target);
    }
  };
  roots.forEach(visit);
  return seen;
}

describe('production dependencies of @rps/server', () => {
  const closure = productionClosure(['apps/server', 'packages/shared']);

  it('are found in the lockfile (the walk is not vacuous)', () => {
    expect(closure.size).toBeGreaterThan(20);
    expect([...closure]).toContain('node_modules/socket.io');
    expect([...closure]).toContain('node_modules/ioredis');
  });

  it('contain no OS/CPU-specific, optional or install-script package', () => {
    const platformSpecific = [...closure].filter((path) => {
      const pkg = lock.packages[path];
      return pkg?.os || pkg?.cpu || pkg?.optional || pkg?.hasInstallScript;
    });
    expect(platformSpecific).toEqual([]);
  });
});
